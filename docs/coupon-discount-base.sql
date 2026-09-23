-- ============================================================================
--  A PROMO CODE MUST COME OFF THE WHOLE BASKET, NOT JUST THE CATALOGUE PART
--  Run this by hand in the Supabase SQL editor (DDL cannot go through the app).
-- ============================================================================
--
--  THE BUG
--  place_order() read `orders.subtotal` to decide every money discount, but it
--  read it too early — after the catalogue product lines had been inserted and
--  BEFORE the custom-request and manual lines were. So `v_subtotal` was the
--  catalogue-products total, not the basket total, and five separate decisions
--  were made against the wrong number:
--
--    1. the coupon amount            floor(v_subtotal * value / 100)
--    2. the coupon's eligibility     v_subtotal >= min_subtotal
--    3. the cart_percent offer       floor(v_subtotal * percent / 100)
--    4. that offer's eligibility     min_cart_total <= v_subtotal
--    5. the free-delivery offer      min_cart_total <= v_subtotal
--
--  The cart, meanwhile, quotes the discount on the FULL basket: the storefront
--  sends preview_coupon() its whole cart subtotal, customs included. So the
--  customer was shown one discount and charged a smaller one — and on a basket
--  that only cleared a coupon's minimum thanks to its custom requests, the code
--  was refused outright after the cart had accepted it.
--
--  Live example, order RFQ-9183 (2026-09-14):
--    catalogue products   11,000
--    custom requests      17,000
--    subtotal             28,000
--    coupon HOLA, 15%  -> quoted 4,200, charged 1,650  (15% of 11,000)
--
--  A SECOND, SMALLER HOLE (fixed here too)
--  The coupon lookup checked only `active`, `ends_at` and `min_subtotal`. It
--  never checked `starts_at`, `target_user_ids` or `is_deleted`, even though
--  preview_coupon() refuses all three in the cart — so a code aimed at one
--  customer, or scheduled for the future, worked for anyone who sent it
--  straight to checkout. No live coupon uses those fields today, so this
--  changes nothing now; it makes them trustworthy from here on. See the
--  comment at the coupon block for what is deliberately NOT changed
--  (`product_ids`) and why.
--
--  SECOND CHANGE, ADDED AFTER THE FIRST RUN — RE-RUN THIS FILE
--  The coupon block used to DROP a code that failed any of its conditions:
--  the order went through at full price with no coupon and no error. The
--  subtotal bug above triggered exactly that on every custom-only basket
--  (v_subtotal was 0, so `0 >= min_subtotal` failed) — the cart showed 15%,
--  the order recorded nothing, and the customer's tracking page and the
--  admin's alert both showed no discount. Now a code that was sent is either
--  applied or REFUSED with a named reason (coupon_not_found, coupon_expired,
--  coupon_not_started, coupon_not_targeted, coupon_min_subtotal:<min>). The
--  cart turns each into a message, removes the code, and lets the customer
--  order again at the honest price. See the coupon block for the reasoning.
--
--  This file is a plain CREATE OR REPLACE — safe to run as many times as you
--  like, and running it again is how the second change lands.
--
--  THE FIX
--  Move the custom-request/manual insert loop ABOVE the `select subtotal`, so
--  the discount block sees the finished basket. Nothing else changes: the same
--  statements, in a different order. Delivery still stands outside the base —
--  it is written in the finalize step after the discount is decided, and the
--  discount is still capped with `least(v_offer_discount, subtotal)`, so a
--  100% code cancels the goods and leaves the customer paying delivery only.
--
--  SCOPE
--  Future orders only. Orders already placed keep the totals they were charged;
--  repricing them is a business decision, not a migration (see VERIFY below for
--  a query that lists the affected ones).
--
--  This is a full CREATE OR REPLACE built from the function as this repo last
--  recorded it (docs/admin-manual-pricing.sql at commit 6b0a74d). Its behaviour
--  was reconfirmed against production before writing this. If you have hand-
--  edited place_order() in the SQL editor since, diff before running:
--    select pg_get_functiondef('public.place_order(text,text,text,text,text,text,jsonb,jsonb,text)'::regprocedure);
-- ============================================================================

begin;

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
--  0. Is the function you have live actually this one? Both must read TRUE.
--     (pg_get_functiondef keeps the body verbatim, comments included.)
--
--       select position('select subtotal into v_subtotal' in def)
--                > position('custom-request and manual line items' in def)
--                as customs_priced_before_discount,
--              position('coupon_not_found' in def) > 0
--                as sent_code_is_never_dropped
--         from (select pg_get_functiondef(
--                 'public.place_order(text,text,text,text,text,text,jsonb,jsonb,text)'::regprocedure
--               ) as def) d;
--
--  1. The discount base is now the whole basket. Place a test order with one
--     catalogue product and one custom request, apply a percent code, then:
--
--       select code, subtotal, discount_total, delivery_fee, total, coupon_code
--         from public.orders order by created_at desc limit 1;
--
--     discount_total must equal floor(subtotal * value / 100) — NOT some
--     fraction of it — and total must equal subtotal - discount_total +
--     delivery_fee.
--
--  2. HONOURING A CODE THAT WAS DROPPED (optional, one order at a time)
--
--     Every Telegram alert carrying the "⚠️" block names an order whose
--     customer entered a code that the old function then left off. The order
--     itself is fine — it is just billed without the discount the customer
--     saw. To give it to them after the fact, set the discount by hand; the
--     total recomputes itself, and the redemption trigger records the use.
--     (It will refuse with coupon_per_user_limit if that customer has already
--     used a once-per-customer code on another order — that is the rule
--     working, not a fault.)
--
--       update public.orders
--          set coupon_code    = 'HOLA',
--              discount_total = least(subtotal, floor(subtotal * 15 / 100.0)::int),
--              offer_note     = 'كوبون HOLA'
--        where code = 'RFQ-9xxx'
--          and coupon_code is null;
--
--     Candidates, if the alerts are gone: orders since the alarm went live that
--     carry custom lines and no code. Not all of these tried a code — check
--     against the alerts, or ask the customer — but every one that did is here.
--
--       select o.code, o.created_at, o.customer_name, o.subtotal, o.total
--         from public.orders o
--        where o.coupon_code is null
--          and o.created_at >= '2026-09-14'
--          and exists (select 1 from public.order_items i
--                       where i.order_id = o.id and i.product_id is null)
--        order by o.created_at;
--
--  3. Orders that were under-discounted by the old ordering (for the record —
--     this migration does not change them):
--
--       select o.code, o.created_at, o.coupon_code, o.subtotal, o.discount_total,
--              sum(i.line_total) filter (where i.product_id is null) as customs_total,
--              floor(o.subtotal * c.value / 100.0)::int as discount_it_should_have_had
--         from public.orders o
--         join public.coupons c on c.code = o.coupon_code
--         join public.order_items i on i.order_id = o.id
--        where c.discount_type = 'percent'
--        group by o.code, o.created_at, o.coupon_code, o.subtotal, o.discount_total, c.value
--       having sum(i.line_total) filter (where i.product_id is null) > 0
--          and o.discount_total < floor(o.subtotal * c.value / 100.0)::int
--        order by o.created_at desc;
-- ============================================================================
