-- ============================================================================
--  A DELIVERY FEE FOR EVERY PROVINCE, NOT JUST KARBALA
--  Run this by hand in the Supabase SQL editor (DDL cannot go through the app).
-- ============================================================================
--
--  WHAT THE SHOP HAS NOW
--  Two numbers on `settings`: `delivery_fee_karbala` and
--  `delivery_fee_default`. Karbala is cheap because the shop is in Karbala;
--  everywhere else in Iraq is charged one flat rate. That is wrong in both
--  directions — a parcel to Baghdad and a parcel into the Kurdistan Region
--  (different carriers, different rates, a regional border in between) are
--  billed identically, and the only way to price one was to reprice all
--  seventeen.
--
--  WHAT THIS ADDS
--  `province_delivery_fees` — one optional row per governorate. A province WITH
--  a row is charged that fee. A province WITHOUT one keeps falling back exactly
--  as it does today: the Karbala column for Karbala, the default for the rest.
--
--  So the table is deliberately SPARSE. It is a set of exceptions, not a
--  register that has to be complete, and an empty table behaves identically to
--  the shop as it is right now. The dashboard editor leans on that: a blank
--  field means "no row", which is the only way to say "charge the default" —
--  0 is a real price (free delivery to that province) and an integer column has
--  no spare value for "unset".
--
--  BOTH HALVES ARE IN THIS ONE FILE, ON PURPOSE
--  The table and the replaced place_order() go in together, inside one
--  transaction. They must not land separately: the cart quotes the fee from
--  this table the moment it exists (lib/data/catalog.ts reads it, and
--  deliveryFeeFor() prefers it), while place_order() is what actually CHARGES.
--  Create the table without replacing the function and every province you price
--  is quoted one fee and billed another.
--
--  Until this file is run, nothing changes: the read returns {} (a missing table
--  is caught and treated as "no exceptions"), the dashboard editor says which
--  file to run instead of silently saving nothing, and the fee stays the pair of
--  numbers it is today.
--
--  WHAT IS *NOT* CHANGED
--  `settings.delivery_fee_karbala` stays, and stays meaningful: it is step 2 of
--  the lookup. The dashboard has no separate field for it any more (Karbala is
--  an ordinary row in the province grid) so updateProvinceDeliveryFeesAction
--  writes it alongside the Karbala row, keeping the fallback honest for the day
--  that row is cleared.
--
--  Delivery still stands outside the discount, exactly as before: the money
--  discount is capped with `least(v_offer_discount, subtotal)` so it can only
--  ever cancel the GOODS, and a free-delivery offer still beats the province
--  rate (`coalesce(v_delivery_offer.delivery_fee, v_delivery_base)`).
--
--  SCOPE
--  Future orders only. Orders already placed keep the delivery they were
--  charged.
--
--  The function half is a full CREATE OR REPLACE built from the function as
--  this repo last recorded it (docs/coupon-discount-base.sql). ONLY the delivery
--  block changed; every other statement is byte-for-byte what is there now. If
--  you have hand-edited place_order() in the SQL editor since, diff before
--  running:
--    select pg_get_functiondef('public.place_order(text,text,text,text,text,text,jsonb,jsonb,text)'::regprocedure);
-- ============================================================================

begin;

-- ============================================================================
--  STEP 1 — The table
-- ============================================================================
--  `province_code` is both the primary key and the foreign key: one fee per
--  province, and a fee for a province that does not exist is rejected rather
--  than sitting in the table forever charging nobody. `on delete cascade`
--  because a retired province has no fee worth keeping.
--
--  No `default` on `fee`: every row here is a deliberate price. A row that
--  appeared with a silent 0 would mean free delivery, which is the most
--  expensive possible typo.
-- ----------------------------------------------------------------------------

create table if not exists public.province_delivery_fees (
  province_code text primary key
    references public.provinces(code) on delete cascade,
  fee integer not null check (fee >= 0 and fee <= 1000000),
  updated_at timestamptz not null default now()
);

comment on table public.province_delivery_fees is
  'Optional per-province delivery fee. A province with no row falls back to settings.delivery_fee_karbala (Karbala) or settings.delivery_fee_default. See deliveryFeeFor() in lib/products.ts.';

-- ============================================================================
--  STEP 2 — Who can read and write it
-- ============================================================================
--  Read: everyone. The storefront quotes the fee before checkout and reads it
--  with the anon key (lib/supabase/anon.ts), so a shopper has to be able to see
--  what delivery to their province costs. It is a price list — the same thing
--  the ticker advertises.
--
--  Write: admins only, through is_admin(). The dashboard action writes with the
--  service-role client, which bypasses RLS entirely; this policy is what stops
--  a signed-in customer writing their own delivery fee with the anon key.
-- ----------------------------------------------------------------------------

alter table public.province_delivery_fees enable row level security;

drop policy if exists province_delivery_fees_read on public.province_delivery_fees;
create policy province_delivery_fees_read
  on public.province_delivery_fees
  for select
  using (true);

drop policy if exists province_delivery_fees_write on public.province_delivery_fees;
create policy province_delivery_fees_write
  on public.province_delivery_fees
  for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.province_delivery_fees to anon, authenticated;
grant all    on public.province_delivery_fees to service_role;

-- ============================================================================
--  STEP 3 — Seed Karbala, so today's one exception survives explicitly
-- ============================================================================
--  Karbala is the only province that has ever had a fee of its own, and after
--  this it is an ordinary row like any other. Copying the column into a row
--  makes that exception visible in the dashboard grid instead of hidden in a
--  fallback, and means the editor opens showing the rate the shop is really
--  charging rather than a blank that reads as "default".
--
--  `on conflict do nothing`: re-running this file must never overwrite a fee an
--  admin has since set.
-- ----------------------------------------------------------------------------

insert into public.province_delivery_fees (province_code, fee)
select p.code, coalesce(s.delivery_fee_karbala, 3000)
  from public.provinces p
  cross join public.settings s
 where p.code = 'karbala'
   and s.id = true
on conflict (province_code) do nothing;

-- ============================================================================
--  STEP 4 — place_order() reads the table first
-- ============================================================================
--  Full CREATE OR REPLACE, built from docs/coupon-discount-base.sql. The ONLY
--  difference is the "BASE province delivery fee" block, which gains a left
--  join onto the new table; search for it below. Safe to run repeatedly.
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

  -- GOODS subtotal: every line now written to this order — catalogue products,
  -- custom design requests AND admin manual lines. Delivery is deliberately not
  -- in it; it is added in the finalize step below. That is the shop's stated
  -- rule exactly: a promo code comes off the goods, never off delivery.
  --
  -- THIS READ IS THE WHOLE FIX. It used to happen BEFORE the custom and manual
  -- lines were inserted, so `subtotal` was the catalogue-products total alone.
  -- Five things below key off it — the coupon amount, the coupon's min_subtotal
  -- gate, the cart_percent offer, its min_cart_total gate, and the free-delivery
  -- offer's threshold — so on any order carrying custom requests all five were
  -- decided on a fraction of what the customer was actually charged. The cart
  -- had already quoted the discount on the full basket (preview_coupon is sent
  -- the whole cart subtotal), so the customer was shown one number and billed
  -- another: order RFQ-9183 was quoted 4,200 off 28,000 and charged 1,650 —
  -- 15% of the 11,000 of catalogue products, with 17,000 of custom requests
  -- silently excluded from the base.
  select subtotal into v_subtotal from public.orders where id = v_order_id;

  -- coupon candidate
  --
  -- A CODE THAT WAS SENT IS EITHER APPLIED OR REFUSED — NEVER DROPPED.
  --
  -- The first version of this block was one SELECT with every condition in
  -- its WHERE clause, and `if v_coupon.code is not null then ...` after it. A
  -- code that failed any condition simply matched no row, and the order went
  -- through at full price with coupon_code = NULL. Nothing raised, nothing
  -- logged. The cart had already shown the customer their 15%.
  --
  -- That is exactly how the subtotal bug above hurt people for as long as it
  -- did: on a custom-only basket the old, too-early v_subtotal was 0, so
  -- `0 >= min_subtotal` failed, the SELECT found nothing, and the order was
  -- placed without the code. The customer saw "-4,200" in the cart, the admin
  -- saw an order with no discount, and the only trace was the mismatch alarm
  -- in Telegram. Between the alarm going live and this file being run, that
  -- was every order that tried to use a code.
  --
  -- So each condition is now checked one at a time and RAISES with a name the
  -- app can put into words. The transaction rolls back, the cart takes the
  -- code off, tells the customer why, and lets them press Order again at the
  -- honest price — or fix the basket. A discount can drift between preview
  -- and checkout for many reasons in future; whatever the reason, the order
  -- is never quietly placed at a price the customer did not see.
  --
  -- The conditions themselves are the ones preview_coupon() enforces in the
  -- cart, so on a healthy system none of these ever fires — they are a tripwire.
  --
  -- STILL NOT ENFORCED HERE: `product_ids`. A coupon scoped to specific products
  -- discounts the WHOLE basket, both in the cart preview and here — the two
  -- agree, so no customer is mis-quoted, but the admin's product selection does
  -- not restrict the discount the way the control implies. Fixing that means
  -- changing preview_coupon() in step with this function, and preview_coupon()
  -- has never been committed to the repo. Left alone deliberately rather than
  -- half-changed, which would reintroduce exactly the quote-vs-charge split this
  -- migration exists to remove.
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select * into v_coupon from public.coupons
    where code = upper(btrim(p_coupon_code)) and active and not is_deleted;

    if v_coupon.code is null then
      raise exception 'coupon_not_found';
    end if;
    if v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      raise exception 'coupon_not_started';
    end if;
    if v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
      raise exception 'coupon_expired';
    end if;
    -- A targeted code is for named accounts only; a guest (auth.uid() null)
    -- can never be on the list, so the null has to count as "not targeted".
    if v_coupon.target_user_ids is not null
       and (auth.uid() is null or not (auth.uid() = any(v_coupon.target_user_ids))) then
      raise exception 'coupon_not_targeted';
    end if;
    if v_subtotal < coalesce(v_coupon.min_subtotal, 0) then
      raise exception 'coupon_min_subtotal:%', coalesce(v_coupon.min_subtotal, 0);
    end if;

    v_coupon_discount := case when v_coupon.discount_type = 'percent'
      then floor(v_subtotal * v_coupon.value / 100.0)::int
      else v_coupon.value end;
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

  -- BASE province delivery fee. Three steps, most specific first — the SAME
  -- order as deliveryFeeFor() in lib/products.ts, which is what the cart quotes
  -- the customer before they press the button:
  --   1. the admin's own fee for this province, from province_delivery_fees;
  --   2. the Karbala column, the one province that had a rate of its own;
  --   3. the all-provinces default.
  -- A left join rather than a second select, so a province with no row of its
  -- own costs nothing extra to resolve, and so a null fee (impossible through
  -- the dashboard, possible by hand) falls through to step 2 instead of
  -- charging null and taking the whole total with it.
  select coalesce(
           f.fee,
           case when p_province_code = 'karbala'
                then coalesce(s.delivery_fee_karbala, 3000)
                else coalesce(s.delivery_fee_default, 5000) end
         )
    into v_delivery_base
  from public.settings s
  left join public.province_delivery_fees f
         on f.province_code = p_province_code
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
--  1. The function you have live is this one — must read TRUE:
--
--       select position('province_delivery_fees f' in def) > 0 as reads_province_table
--         from (select pg_get_functiondef(
--                 'public.place_order(text,text,text,text,text,text,jsonb,jsonb,text)'::regprocedure
--               ) as def) d;
--
--  2. What every province will be charged right now, fallbacks included. This
--     is the same three-step answer deliveryFeeFor() gives the cart, so the
--     two columns are what the customer sees and what they are billed:
--
--       select p.code,
--              f.fee as own_fee,
--              coalesce(
--                f.fee,
--                case when p.code = 'karbala'
--                     then coalesce(s.delivery_fee_karbala, 3000)
--                     else coalesce(s.delivery_fee_default, 5000) end
--              ) as charged
--         from public.provinces p
--         cross join public.settings s
--         left join public.province_delivery_fees f on f.province_code = p.code
--        order by p.sort_order;
--
--  3. Place a test order to a province you have priced, then confirm the fee
--     landed and the total is still subtotal − discount + delivery:
--
--       select code, province_code, subtotal, discount_total, delivery_fee, total
--         from public.orders order by created_at desc limit 1;
--
--  4. Price the Kurdistan Region in one statement, if you would rather not use
--     the dashboard. The three codes are the region's governorates as this
--     database lists them (Halabja has no row — see KURDISTAN_CODES in
--     lib/provinces.ts):
--
--       insert into public.province_delivery_fees (province_code, fee)
--       values ('erbil', 8000), ('sulaymaniyah', 8000), ('duhok', 8000)
--       on conflict (province_code)
--         do update set fee = excluded.fee, updated_at = now();
--
--  5. Put one province back on the default fee — delete the row, don't zero it.
--     A fee of 0 means free delivery there:
--
--       delete from public.province_delivery_fees where province_code = 'anbar';
-- ============================================================================
