-- ============================================================================
--  ADMIN MANUAL PRICING + PER-REQUEST ARTWORK          run in the SQL editor
-- ============================================================================
--
--  WHAT THIS ADDS
--
--  1. A fixed price an admin can put on a custom request. Today a custom line
--     is always unit_price x images. Some requests can't be priced that way —
--     a customer who puts six designs on one sticker sheet is not "one sticker"
--     — so the admin gets to name the price for the whole request instead.
--
--  2. An admin-only MANUAL order line: a free-text job with a price, for work
--     that isn't in the catalogue at all (a walk-in, a DM commission).
--
--  3. Each custom request now keeps ITS OWN artwork on its own order line.
--     Until now every request in a basket dumped its images into one merged
--     `orders.custom_images` array, so a basket with stickers AND brooches AND
--     posters showed the admin one undifferentiated grid with no way to tell
--     which image belonged to which job. That is the bug this fixes.
--
--  SAFE TO RUN
--  - place_order keeps the SAME name and the SAME argument list, so this is a
--    true CREATE OR REPLACE: no DROP, and its existing grants survive.
--  - Every new column is added with `if not exists` and a default, so the app
--    running against the OLD schema and the NEW one both work. The frontend
--    reads the new per-line columns when they are there and falls back to the
--    merged array when they are not.
--  - Wrapped in a transaction: if any step fails, nothing changed.
--
--  ORDER OF STEPS MATTERS: manual_total must exist before line_total is
--  redefined to reference it.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
--  STEP 1 — New columns on order_items
-- ----------------------------------------------------------------------------
--  manual_total  : an exact line total that overrides the computed one. NULL
--                  means "price it the normal way" — which is every row that
--                  exists today, so nothing is repriced by this migration.
--  custom_images : the artwork for THIS request only (the fix for #3).
--  custom_kind   : 'brooch' | 'sticker' | 'poster' | 'manual'. Lets the admin
--                  UI group lines by what they are without parsing the Arabic
--                  name snapshot, which is a display string and may change.
-- ----------------------------------------------------------------------------

alter table public.order_items
  add column if not exists manual_total int
    check (manual_total is null or (manual_total >= 0 and manual_total <= 100000000));

alter table public.order_items
  add column if not exists custom_images text[] not null default '{}';

alter table public.order_items
  add column if not exists custom_kind text
    check (custom_kind is null or custom_kind in ('brooch', 'sticker', 'poster', 'manual'));

-- ----------------------------------------------------------------------------
--  STEP 2 — line_total honours manual_total
-- ----------------------------------------------------------------------------
--  A generated column's expression cannot be altered in place, so it is
--  dropped and re-added — exactly what migration 0012 already did to this same
--  column when free_qty was introduced.
--
--  Nothing depends on this column that would block the drop: `daily_revenue`
--  is built on orders.total, and the functions that read line_total
--  (dashboard_stats, track_order, the subtotal trigger) are recompiled on next
--  call rather than pinned to the column.
--
--  The previous expression is preserved verbatim inside the coalesce, so every
--  existing row keeps the value it has right now.
-- ----------------------------------------------------------------------------

alter table public.order_items drop column if exists line_total;

alter table public.order_items
  add column line_total int
  generated always as (
    coalesce(manual_total, unit_price * greatest(qty - free_qty, 0))
  ) stored;

-- orders.subtotal is maintained by a trigger on order_items, and re-adding the
-- column above did not fire it. The values are unchanged (every manual_total is
-- NULL at this point), but recompute anyway so the two can never be assumed to
-- have drifted.
update public.orders o
   set subtotal = coalesce(
     (select sum(i.line_total) from public.order_items i where i.order_id = o.id), 0)
 where o.subtotal <> coalesce(
     (select sum(i.line_total) from public.order_items i where i.order_id = o.id), 0);

-- ----------------------------------------------------------------------------
--  STEP 3 — Backfill per-line artwork where it can be done EXACTLY
-- ----------------------------------------------------------------------------
--  An order whose basket held a single custom request is unambiguous: every
--  image in orders.custom_images belongs to that one line. Orders that merged
--  SEVERAL requests cannot be split after the fact — the grouping was never
--  recorded — so they are left alone and the admin UI keeps showing them as one
--  merged grid, which is what it shows today. New orders record the grouping
--  properly from here on.
-- ----------------------------------------------------------------------------

with custom_lines as (
  select i.id as item_id,
         i.order_id,
         count(*) over (partition by i.order_id) as line_count
  from public.order_items i
  where i.product_id is null
)
update public.order_items i
   set custom_images = o.custom_images,
       -- custom_type is free text on orders; only copy it across when it is one
       -- of the three real kinds, so the new check constraint can't be tripped
       -- by a stray value on an old row.
       custom_kind = case when o.custom_type in ('brooch', 'sticker', 'poster')
                          then o.custom_type else null end
  from custom_lines c
  join public.orders o on o.id = c.order_id
 where i.id = c.item_id
   and c.line_count = 1
   and coalesce(array_length(o.custom_images, 1), 0) > 0
   and coalesce(array_length(i.custom_images, 1), 0) = 0;

-- ----------------------------------------------------------------------------
--  STEP 4 — place_order: manual prices, manual lines, per-line artwork
-- ----------------------------------------------------------------------------
--  Signature is UNCHANGED. The two new capabilities ride inside the existing
--  p_customs array, so the frontend needs no new argument and an older
--  frontend keeps working untouched:
--
--    { type: 'sticker', images: [...], manual_total: 25000 }
--        -> a normal custom request billed at exactly 25,000 instead of
--           unit_price x 23.
--
--    { type: 'manual', title: '...', description: '...', manual_total: 40000 }
--        -> a free-text line priced at exactly 40,000, no artwork.
--
--  BOTH are refused unless the caller is an admin. is_admin() reads the JWT of
--  the calling user, which survives into this SECURITY DEFINER body, so a
--  crafted request from a customer cannot set its own price.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_order(p_customer_name text, p_customer_phone text, p_province_code text, p_address_line text, p_notes text, p_coupon_code text, p_items jsonb, p_customs jsonb DEFAULT '[]'::jsonb, p_customer_phone2 text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id uuid; v_code text; v_total int;
  v_item jsonb; v_qty int; v_unit int; v_free int;
  v_prod public.products%rowtype;
  v_pi public.product_items%rowtype;
  v_bundle public.offers%rowtype;
  v_cart_offer public.offers%rowtype;
  v_delivery_offer public.offers%rowtype;
  v_coupon public.coupons%rowtype;
  v_item_id uuid; v_waterproof boolean; v_custom text;
  v_flash int; v_pct int;
  v_subtotal int; v_coupon_discount int := 0; v_offer_discount int := 0;
  v_note text := null; v_applied_coupon text := null;
  -- base province delivery fee (from settings)
  v_delivery_base int;
  -- GLOBAL by-count ladder, resolved once for the whole order
  v_volume_count int := 0;
  v_volume_unit int := null;
  v_is_volume boolean;
  -- custom-request merge
  v_has_products boolean;
  v_has_customs boolean;
  v_cust jsonb; v_ctype text; v_cwaterproof boolean; v_cqty int; v_cextra int;
  v_cimg text; v_clabel_ar text; v_clabel_en text;
  v_all_custom_images text[] := '{}';
  v_any_custom_waterproof boolean := false;
  v_first_custom_type text := null;
  -- NEW: admin manual pricing / manual lines / per-line artwork
  v_is_admin boolean := false;
  v_cmanual int;
  v_cimgs text[];
  v_mtitle text; v_mdesc text;
  v_has_real_customs boolean := false;
  v_has_manuals boolean := false;
begin
  v_has_products := p_items   is not null and jsonb_array_length(p_items)   > 0;
  v_has_customs  := p_customs is not null and jsonb_array_length(p_customs) > 0;
  if not v_has_products and not v_has_customs then raise exception 'no_items'; end if;

  -- Resolved once. Only consulted when a request actually asks for a manual
  -- price, so an ordinary customer checkout is unaffected by it.
  if v_has_customs then
    v_is_admin := coalesce(public.is_admin(), false);
  end if;

  insert into public.orders (user_id, customer_name, customer_phone, customer_phone2,
    province_code, address_line, notes, status)
  values (auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    nullif(left(btrim(coalesce(p_customer_phone2, '')), 20), ''),
    p_province_code, p_address_line, p_notes, 'review')
  returning id, code into v_order_id, v_code;

  -- ------------- PRE-PASS: resolve the shared by-count ladder ---------------
  -- Count every volume-priced piece in the order first, so items from different
  -- packages/categories accumulate into ONE count (matching the cart), then
  -- look up the rung that count earns.
  if v_has_products then
    for v_item in select * from jsonb_array_elements(p_items) loop
      select coalesce(volume_priced, false) into v_is_volume
      from public.products
      where id = (v_item->>'product_id') and is_active = true and not is_deleted;

      if coalesce(v_is_volume, false) then
        v_volume_count := v_volume_count
          + greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));
      end if;
    end loop;
  end if;

  if v_volume_count > 0 then
    -- greatest rung whose min_qty <= count
    select vt.unit_price into v_volume_unit
    from public.volume_tiers vt
    where vt.min_qty <= v_volume_count
    order by vt.min_qty desc
    limit 1;

    -- a count below the smallest rung still gets the smallest rung's price
    if v_volume_unit is null then
      select vt.unit_price into v_volume_unit
      from public.volume_tiers vt
      order by vt.min_qty asc
      limit 1;
    end if;
  end if;

  -- ---------------------------- product line items --------------------------
  if v_has_products then
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));

    select * into v_prod from public.products
    where id = (v_item->>'product_id') and is_active = true and not is_deleted;
    if v_prod.id is null then raise exception 'invalid_product %', v_item->>'product_id'; end if;

    v_item_id := null; v_pi := null;
    if coalesce(v_item->>'item_id', '') <> '' then
      select * into v_pi from public.product_items
      where id = (v_item->>'item_id')::uuid and product_id = v_prod.id
        and is_active and not is_deleted;
      if v_pi.id is null then raise exception 'invalid_item %', v_item->>'item_id'; end if;
      v_item_id := v_pi.id;
    end if;

    -- base unit: shared by-count ladder -> per-product tier -> item/product price
    -- (same precedence the storefront uses in unitPriceFor()).
    if coalesce(v_prod.volume_priced, false) and v_volume_unit is not null then
      v_unit := v_volume_unit;
    elsif v_prod.kind = 'tiered' then
      select t.unit_price into v_unit
      from public.product_price_tiers t
      where t.product_id = v_prod.id and t.min_qty <= v_qty
      order by t.min_qty desc limit 1;
      v_unit := coalesce(v_unit, v_prod.price);
    else
      v_unit := coalesce(v_pi.price, v_prod.price);
    end if;

    -- Add-ons join the base BEFORE the discount, so a percentage comes off the
    -- whole price the buyer pays instead of the plain sheet with the extra
    -- added back at full price: 2,000 + 1,000 waterproof at -50% is 1,500, not
    -- 2,000. Mirrors unitPriceFor() in lib/pricing.ts.
    v_waterproof := coalesce((v_item->>'waterproof')::boolean, false) and v_prod.waterproof;
    if v_waterproof then v_unit := v_unit + coalesce(v_prod.waterproof_surcharge, 0); end if;

    select coalesce(max(o.percent), 0) into v_flash
    from public.offers o
    where o.kind = 'flash' and o.product_id = v_prod.id
      and o.active and not o.is_deleted
      and (o.starts_at is null or o.starts_at <= now()) and o.ends_at > now()
      and (o.user_id is null or o.user_id = auth.uid());
    v_pct := greatest(coalesce(v_prod.discount_percent, 0), v_flash);

    -- Best (lowest) of percent-off vs the product's fixed IQD off.
    v_unit := least(
      case when v_pct > 0 then floor(v_unit * (100 - v_pct) / 100.0)::int else v_unit end,
      case when coalesce(v_prod.discount_fixed, 0) > 0
           then greatest(0, v_unit - v_prod.discount_fixed) else v_unit end
    );

    v_custom := nullif(left(btrim(coalesce(v_item->>'custom_image_url', '')), 500), '');
    if v_custom is not null and not v_prod.allow_custom_image then v_custom := null; end if;

    v_free := 0;
    select * into v_bundle from public.offers o
    where o.kind = 'bundle' and o.product_id = v_prod.id
      and o.active and not o.is_deleted
      and (o.starts_at is null or o.starts_at <= now())
      and (o.ends_at is null or o.ends_at > now())
      and (o.user_id is null or o.user_id = auth.uid())
    order by o.free_qty::numeric / (o.buy_qty + o.free_qty) desc limit 1;
    if v_bundle.id is not null then
      v_free := (v_qty / (v_bundle.buy_qty + v_bundle.free_qty)) * v_bundle.free_qty;
    end if;

    insert into public.order_items
      (order_id, product_id, item_id, name_ar_snapshot, name_en_snapshot,
       item_name_ar, item_name_en, unit_price, qty, free_qty,
       waterproof, custom_image_url, note)
    values
      (v_order_id, v_prod.id, v_item_id, v_prod.name_ar, v_prod.name_en,
       v_pi.name_ar, v_pi.name_en, v_unit, v_qty, v_free,
       v_waterproof, v_custom, nullif(btrim(coalesce(v_item->>'note', '')), ''));

    -- Stock is NOT taken here. It moves when the admin ACCEPTS the order
    -- (admin_set_order_stock), so a basket sitting in review doesn't hold
    -- pieces hostage, and cancelling gives them straight back.
    --
    -- What stays is a refusal to take an order for something already at zero:
    -- the shop should never accept an order it can visibly not fill. Two
    -- customers CAN both order the last piece — the admin decides who gets it
    -- by accepting, and the second acceptance is the one that's refused.
    if v_item_id is not null then
      if coalesce(v_pi.stock, 0) < v_qty then
        raise exception 'out_of_stock:%', coalesce(nullif(v_pi.name_ar, ''), v_prod.name_ar);
      end if;
    elsif coalesce(v_prod.stock, 0) < v_qty then
      raise exception 'out_of_stock:%', v_prod.name_ar;
    end if;
  end loop;
  end if;

  -- PRODUCT subtotal (customs are added after, so discounts never touch them —
  -- and neither do they touch an admin's manually priced line, which is the
  -- point of naming a price by hand)
  select subtotal into v_subtotal from public.orders where id = v_order_id;

  -- coupon candidate
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon from public.coupons
    where code = upper(btrim(p_coupon_code)) and active
      and (ends_at is null or ends_at > now())
      and v_subtotal >= min_subtotal;
    if v_coupon.code is not null then
      v_coupon_discount := case when v_coupon.discount_type = 'percent'
        then floor(v_subtotal * v_coupon.value / 100.0)::int
        else v_coupon.value end;
    end if;
  end if;

  -- conditional cart-percent offer candidate (global or user-specific)
  select * into v_cart_offer from public.offers o
  where o.kind = 'cart_percent' and o.active and not o.is_deleted
    and o.min_cart_total <= v_subtotal
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at is null or o.ends_at > now())
    and (o.user_id is null or o.user_id = auth.uid())
  order by o.percent desc limit 1;
  if v_cart_offer.id is not null then
    v_offer_discount := floor(v_subtotal * v_cart_offer.percent / 100.0)::int;
  end if;

  -- best SINGLE money discount wins (no stacking)
  if v_offer_discount >= v_coupon_discount and v_offer_discount > 0 then
    v_note := v_cart_offer.title_ar || ' · ' || v_cart_offer.title_en;
  elsif v_coupon_discount > 0 then
    v_offer_discount := v_coupon_discount;
    v_applied_coupon := v_coupon.code;
    v_note := 'كوبون ' || v_coupon.code;
  else
    v_offer_discount := 0;
  end if;

  -- BASE province delivery fee (Karbala cheaper), read from settings.
  select case when p_province_code = 'karbala'
              then coalesce(delivery_fee_karbala, 3000)
              else coalesce(delivery_fee_default, 5000) end
    into v_delivery_base
  from public.settings
  limit 1;
  v_delivery_base := coalesce(v_delivery_base, case when p_province_code = 'karbala' then 3000 else 5000 end);

  -- delivery offer applies independently of the money discount (beats the base)
  select * into v_delivery_offer from public.offers o
  where o.kind = 'cart_delivery' and o.active and not o.is_deleted
    and o.min_cart_total <= v_subtotal
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at is null or o.ends_at > now())
    and (o.user_id is null or o.user_id = auth.uid())
  order by o.delivery_fee asc limit 1;

  -- ------------------- custom-request and manual line items ------------------
  if v_has_customs then
    for v_cust in select * from jsonb_array_elements(p_customs) loop
      v_ctype := v_cust->>'type';

      -- An exact price for this line, replacing whatever the ladder computes.
      -- Admin-only, and range-checked so it can't overflow the int columns.
      v_cmanual := nullif(btrim(coalesce(v_cust->>'manual_total', '')), '')::int;
      if v_cmanual is not null then
        if not v_is_admin then raise exception 'forbidden_manual_price'; end if;
        if v_cmanual < 0 or v_cmanual > 100000000 then raise exception 'invalid_manual_total'; end if;
      end if;

      -- ---------------------------------------------------------------- manual
      -- A free-text job with a price and no artwork: not in the catalogue, not
      -- priced from custom_pricing. qty is 1, so unit_price and line_total agree
      -- without needing the override to disagree with them.
      if v_ctype = 'manual' then
        if not v_is_admin then raise exception 'forbidden_manual_order'; end if;
        if v_cmanual is null then raise exception 'manual_price_required'; end if;

        v_mtitle := nullif(left(btrim(coalesce(v_cust->>'title', '')), 120), '');
        v_mdesc  := nullif(left(btrim(coalesce(v_cust->>'description', '')), 1000), '');

        insert into public.order_items
          (order_id, product_id, name_ar_snapshot, name_en_snapshot,
           unit_price, qty, waterproof, note, manual_total, custom_kind)
        values
          (v_order_id, null,
           coalesce(v_mtitle, 'طلب يدوي'), coalesce(v_mtitle, 'Manual order'),
           v_cmanual, 1, false, v_mdesc, v_cmanual, 'manual');

        v_has_manuals := true;
        continue;
      end if;

      -- -------------------------------------------------- custom design request
      if v_ctype not in ('brooch', 'sticker', 'poster') then raise exception 'invalid_type'; end if;

      if v_cust->'images' is null or jsonb_typeof(v_cust->'images') <> 'array' then
        raise exception 'invalid_image_count';
      end if;
      v_cqty := jsonb_array_length(v_cust->'images');
      if v_cqty < 1 or v_cqty > 100 then raise exception 'invalid_image_count'; end if;

      v_cwaterproof := coalesce((v_cust->>'waterproof')::boolean, false);
      if v_ctype = 'brooch' then v_cwaterproof := false; end if;

      select unit_price, waterproof_extra into v_unit, v_cextra
      from public.custom_pricing where kind = v_ctype;
      if v_unit is null then raise exception 'pricing_missing'; end if;
      if v_cwaterproof then v_unit := v_unit + v_cextra; end if;

      -- only accept artwork from OUR public custom-artwork bucket. Collected
      -- per request (v_cimgs) as well as for the whole order
      -- (v_all_custom_images) — the per-request array is what lets the admin
      -- see and download each job's designs separately.
      v_cimgs := '{}';
      for v_cimg in select jsonb_array_elements_text(v_cust->'images') loop
        if v_cimg is null or length(v_cimg) > 500
           or position('/storage/v1/object/public/custom-artwork/' in v_cimg) = 0 then
          raise exception 'invalid_image_url';
        end if;
        v_cimgs := array_append(v_cimgs, v_cimg);
        v_all_custom_images := array_append(v_all_custom_images, v_cimg);
      end loop;

      v_clabel_ar := case v_ctype when 'brooch' then 'طلب مخصص — بروش'
                                  when 'sticker' then 'طلب مخصص — ستكر'
                                  else 'طلب مخصص — بوستر' end;
      v_clabel_en := case v_ctype when 'brooch' then 'Custom request — Brooch'
                                  when 'sticker' then 'Custom request — Sticker'
                                  else 'Custom request — Poster' end;

      insert into public.order_items
        (order_id, product_id, name_ar_snapshot, name_en_snapshot,
         unit_price, qty, waterproof, note, manual_total, custom_kind, custom_images)
      values
        (v_order_id, null, v_clabel_ar, v_clabel_en,
         v_unit, v_cqty, v_cwaterproof,
         nullif(left(btrim(coalesce(v_cust->>'description', '')), 1000), ''),
         v_cmanual, v_ctype, v_cimgs);

      v_has_real_customs := true;
      if v_first_custom_type is null then v_first_custom_type := v_ctype; end if;
      if v_cwaterproof then v_any_custom_waterproof := true; end if;
    end loop;
  end if;

  -- --------------------------- finalize the order ---------------------------
  -- NOTE ON DELIVERY: delivery_fee is read from settings above and written here
  -- untouched by any discount. The discount is capped at `subtotal`, so it can
  -- only ever cancel the GOODS — never eat into delivery. A 100% discount
  -- therefore leaves the customer paying exactly the delivery fee.
  --
  -- is_custom now means "a custom DESIGN order and nothing else". A manual
  -- admin line is not a custom request, so an order that is only a manual line
  -- no longer wears the custom-request badge and no longer counts towards the
  -- custom-order stats.
  update public.orders set
    discount_total    = least(v_offer_discount, subtotal),
    coupon_code       = v_applied_coupon,
    delivery_fee      = coalesce(v_delivery_offer.delivery_fee, v_delivery_base),
    offer_note        = v_note,
    is_custom         = (v_has_real_customs and not v_has_products and not v_has_manuals),
    custom_type       = case when v_has_real_customs then v_first_custom_type    else custom_type end,
    custom_images     = case when v_has_real_customs then v_all_custom_images    else custom_images end,
    custom_waterproof = case when v_has_real_customs then v_any_custom_waterproof else custom_waterproof end
  where id = v_order_id;

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end; $function$;

commit;

-- ============================================================================
--  VERIFY
-- ============================================================================
--  New columns are there and line_total honours the override:
--    select column_name, is_generated, generation_expression
--      from information_schema.columns
--     where table_name = 'order_items'
--       and column_name in ('manual_total','custom_images','custom_kind','line_total');
--
--  Per-request artwork on recent custom orders (each row = one request):
--    select o.code, i.custom_kind, i.qty, i.manual_total, i.line_total,
--           coalesce(array_length(i.custom_images, 1), 0) as images
--      from public.order_items i
--      join public.orders o on o.id = i.order_id
--     where i.product_id is null
--     order by o.created_at desc
--     limit 20;
--
--  Nothing was repriced by this migration (expect 0 rows):
--    select code from public.orders o
--     where o.subtotal <> coalesce((select sum(i.line_total)
--       from public.order_items i where i.order_id = o.id), 0);
-- ============================================================================
