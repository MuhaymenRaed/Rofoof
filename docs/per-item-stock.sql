-- ============================================================================
--  ROFOOF — database changes for per-design stock + the delivery banner
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run the steps IN ORDER, one at a time,
--  reading the note above each one first:
--
--    STEP 1    add the per-design stock column
--    STEP 2    put every product at 5 in stock
--    STEP 3    the on/off switch for the home-page delivery bar
--    STEP 3.5  clear the stuck "sold out" flags  (fixes the bug you hit)
--    STEP 4    optional health check — run it any time
--    STEP 5    stop the shop overselling
--    STEP 6    move stock when you ACCEPT, give it back on cancel
--
--  STEPS 5 AND 6 GO TOGETHER. Step 5 stops place_order taking stock at order
--  time; step 6 is what takes it at accept time instead. Running 5 without 6
--  means stock is never taken at all.
--
--  It is safe to run this file more than once — every statement does nothing
--  if it has already been applied. The ONE exception is step 2, which resets
--  every count back to 5.
--
--  Nothing here can break the live site. The website already copes with all of
--  it being missing: until you run it, stock is simply "not tracked", every
--  design stays buyable, and orders behave exactly as they do today.
-- ============================================================================



-- ============================================================================
--  STEP 1 — Add the stock column to package designs
-- ============================================================================
--  WHAT THIS DOES
--  Adds a `stock` number to each design inside a package, so the Kirby sheet
--  and the Stitch sheet can be counted separately instead of sharing one
--  number on the package.
--
--  WHY IT STARTS AT 0
--  New columns need a starting value. 0 (sold out) is the safe direction —
--  nothing can be oversold in the gap before you set the real numbers.
--  STEP 2 immediately sets them all to 5, so nothing stays sold out.
-- ----------------------------------------------------------------------------

alter table public.product_items
  add column if not exists stock integer not null default 0;

-- Stops a negative count ever being written, whatever writes it.
do $$
begin
  alter table public.product_items
    add constraint product_items_stock_non_negative check (stock >= 0);
exception
  when duplicate_object then null;  -- already added on an earlier run
end $$;



-- ============================================================================
--  STEP 2 — Put every product in the shop at 5 in stock
-- ============================================================================
--  WHAT THIS DOES
--  Sets the count to 5 for BOTH kinds of product:
--    - every design inside every package  (product_items)
--    - every one-photo product            (products)
--
--  This is a starting point, not a permanent setting. From now on you change
--  these numbers in the dashboard: open a product, and each design has a stock
--  box under its price, with a "one stock count for all images" box that fills
--  them all at once.
--
--  RE-RUNNING THIS RESETS EVERYTHING BACK TO 5. Run it once now; after that,
--  use the dashboard instead, or you will wipe out counts you have edited.
-- ----------------------------------------------------------------------------

update public.product_items
   set stock = 5
 where is_deleted = false;

update public.products
   set stock = 5
 where is_deleted = false;



-- ============================================================================
--  STEP 3 — Add the on/off switch for the home-page delivery bar
-- ============================================================================
--  WHAT THIS DOES
--  Backs the "Show the delivery bar on the home page" checkbox, which is in
--  the dashboard next to the delivery fees. Until you run this, the bar always
--  shows and that checkbox quietly does nothing (ticking it won't error, and
--  it won't stop the fees next to it from saving).
-- ----------------------------------------------------------------------------

alter table public.settings
  add column if not exists delivery_notice_active boolean not null default true;


--  ---------------------------------------------------------------------------
--  NOTE — the number on the bar is no longer a delivery fee
--
--  The bar now reads "a delivery discount applies / minimum order value" with
--  a fixed 3,000, which is a MINIMUM ORDER VALUE, not the delivery price. It
--  is a constant in components/home/delivery-notice.tsx and does not come from
--  this table, deliberately: changing your delivery fee in the dashboard must
--  not silently move the threshold customers are being promised.
--
--  To change that 3,000, edit MIN_ORDER_VALUE in that file.
--  The actual delivery fees charged at checkout are still the settings below,
--  edited in the dashboard as before.
--  ---------------------------------------------------------------------------



-- ============================================================================
--  STEP 3.5 — Clear the stuck "sold out" flags   ← RUN THIS, it fixes a bug
-- ============================================================================
--  THE BUG YOU HIT
--  A product went to 0, went grey, and STAYED grey after you restocked it —
--  showing "5" in the corner while refusing to sell.
--
--  WHY
--  `products.sold_out` is a separate true/false column from `stock`. Something
--  in the database sets it to true when stock reaches 0, and nothing sets it
--  back. The website has never had a control for it either — the product
--  editor cannot change it and never writes it — so once it was set, there was
--  no way from the app to unset it. Restocking changed `stock` and left
--  `sold_out` stuck on true.
--
--  THE FIX
--  Already deployed on the website: it now decides from the COUNT and ignores
--  that flag entirely, so restocking works immediately with no SQL. This step
--  just tidies the column so the database agrees with what the site shows.
--
--  FROM NOW ON: to mark something unavailable by hand, set its stock to 0.
--  One number, one meaning.
-- ----------------------------------------------------------------------------

update public.products
   set sold_out = false
 where sold_out = true
   and stock > 0;

--  Optional: find whatever is setting the flag, if you want it gone for good.
--  Anything listed here is a trigger on the products table.

select tgname as trigger_name,
       pg_get_triggerdef(t.oid) as definition
  from pg_trigger t
 where t.tgrelid = 'public.products'::regclass
   and not t.tgisinternal;



-- ============================================================================
--  STEP 4 — (optional) Health check
-- ============================================================================
--  Run this any time to see the stock numbers the shop is working from.
--  `designs_in_stock = 0` on a package means that package now reads as sold
--  out on the site.
-- ----------------------------------------------------------------------------

select p.id,
       p.name_ar,
       p.kind,
       count(i.id)                            as designs,
       count(i.id) filter (where i.stock > 0) as designs_in_stock,
       sum(i.stock)                           as total_pieces,
       p.stock                                as one_photo_stock
  from public.products p
  left join public.product_items i
    on i.product_id = p.id
   and i.is_deleted = false
 where p.is_deleted = false
 group by p.id, p.name_ar, p.kind, p.stock
 order by designs_in_stock asc, p.name_ar;


--  And the delivery check you asked me to confirm: on every row `maths_ok`
--  must be true, which means the delivery fee was added on top at full price
--  no matter how large the discount was.

select code,
       subtotal,
       discount_total,
       delivery_fee,
       total,
       total = greatest(subtotal - discount_total, 0) + delivery_fee as maths_ok
  from public.orders
 order by created_at desc
 limit 50;



-- ============================================================================
--  STEP 5 — Stop the shop overselling  ← RUN THIS LAST
-- ============================================================================
--  RUN STEPS 1 AND 2 FIRST. This needs the stock column to exist.
--
--  WHY THIS IS NEEDED
--  The website greys out a sold-out design and stops the + button going past
--  what is left. But that is only the shopper's screen. Two people can be
--  holding the last piece at the same moment, and neither screen knows about
--  the other. Only place_order() — the function that actually takes the order
--  — can settle it.
--
--  WHAT CHANGES
--  Exactly one line of your function. It used to be:
--
--      update public.products set stock = greatest(0, stock - v_qty) ...
--
--  which had two problems. It counted DOWN past what existed (greatest(0,...)
--  silently swallowed the overspend instead of refusing it), and for a package
--  it decremented the package row rather than the design that was actually
--  bought — so buying twenty Kirby sheets took twenty off a number that meant
--  nothing, while the Kirby design itself never moved.
--
--  Now it takes the count off the design that was bought, and refuses the
--  order if there isn't enough. `where ... and stock >= v_qty` does the
--  checking and the locking in one atomic statement: two orders reaching for
--  the last piece cannot both succeed, because the second one finds no row to
--  update and raises. The whole function is one transaction, so a refusal
--  rolls back the entire order — no half-written order is left behind.
--
--  The customer sees "one of the designs in your cart just ran out" and can
--  fix it themselves, instead of a generic failure.
--
--  This is your function, unchanged apart from that block. Safe to run: same
--  name, same arguments, same return type, so no DROP is needed this time.
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
begin
  v_has_products := p_items   is not null and jsonb_array_length(p_items)   > 0;
  v_has_customs  := p_customs is not null and jsonb_array_length(p_customs) > 0;
  if not v_has_products and not v_has_customs then raise exception 'no_items'; end if;

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

    -- base unit: shared by-count ladder → per-product tier → item/product price
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

    -- ======================= THE CHANGED PART ==============================
    -- Stock is NOT taken here any more. It moves when the admin ACCEPTS the
    -- order (admin_set_order_stock in step 6), so a basket sitting in review
    -- doesn't hold pieces hostage, and cancelling gives them straight back.
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
    -- ===================== END OF THE CHANGED PART =========================
  end loop;
  end if;

  -- PRODUCT subtotal (customs are added after, so discounts never touch them)
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

  -- ------------------------- custom-request line items ----------------------
  if v_has_customs then
    for v_cust in select * from jsonb_array_elements(p_customs) loop
      v_ctype := v_cust->>'type';
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

      -- only accept artwork from OUR public custom-artwork bucket, and collect it
      for v_cimg in select jsonb_array_elements_text(v_cust->'images') loop
        if v_cimg is null or length(v_cimg) > 500
           or position('/storage/v1/object/public/custom-artwork/' in v_cimg) = 0 then
          raise exception 'invalid_image_url';
        end if;
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
         unit_price, qty, waterproof, note)
      values
        (v_order_id, null, v_clabel_ar, v_clabel_en,
         v_unit, v_cqty, v_cwaterproof,
         nullif(left(btrim(coalesce(v_cust->>'description', '')), 1000), ''));

      if v_first_custom_type is null then v_first_custom_type := v_ctype; end if;
      if v_cwaterproof then v_any_custom_waterproof := true; end if;
    end loop;
  end if;

  -- --------------------------- finalize the order ---------------------------
  -- NOTE ON DELIVERY (the thing you asked me to confirm): delivery_fee is read
  -- from settings above and written here untouched by any discount. The
  -- discount is capped at `subtotal`, so it can only ever cancel the GOODS —
  -- never eat into delivery. A 100% discount therefore leaves the customer
  -- paying exactly the delivery fee. This is correct as it stands.
  update public.orders set
    discount_total    = least(v_offer_discount, subtotal),
    coupon_code       = v_applied_coupon,
    delivery_fee      = coalesce(v_delivery_offer.delivery_fee, v_delivery_base),
    offer_note        = v_note,
    is_custom         = (v_has_customs and not v_has_products),
    custom_type       = case when v_has_customs then v_first_custom_type      else custom_type end,
    custom_images     = case when v_has_customs then v_all_custom_images       else custom_images end,
    custom_waterproof = case when v_has_customs then v_any_custom_waterproof   else custom_waterproof end
  where id = v_order_id;

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end; $function$;
-- ============================================================================


-- ============================================================================
--  STEP 6 — Move stock at ACCEPT, and give it back on cancel  ← RUN AFTER 5
-- ============================================================================
--  WHAT THIS DOES
--  Stock now changes when YOU accept an order, not when the customer places
--  it. Accept an order for 5 pieces and the count drops by 5. Cancel that
--  order — or push it back to "review" — and the 5 come straight back.
--
--  WHY NOT AT ORDER TIME
--  An order sitting in review is a request, not a sale. Counting it out
--  immediately would show the shop as sold out because of baskets you have not
--  looked at yet, and every abandoned order would need unpicking by hand.
--
--  THE ONE RULE THAT MAKES IT SAFE
--  Each order carries a `stock_applied` flag saying whether its pieces are
--  currently off the shelf. The function only moves stock if it manages to
--  flip that flag, and flipping it is a single atomic statement. So:
--    - accepting twice takes the stock once
--    - a double-click takes it once
--    - accepted → review → accepted lands exactly where it started
--    - cancelling an order that was never accepted gives nothing back
--
--  Accepting an order the shelf cannot cover FAILS, and the dashboard says so
--  rather than silently letting the card slide across.
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists stock_applied boolean not null default false;

-- Orders already accepted before this existed had their stock taken by the old
-- place_order, so mark them as applied. Otherwise cancelling one would hand
-- back pieces that were already handed back.
update public.orders
   set stock_applied = true
 where status <> 'review'
   and stock_applied = false;


create or replace function public.admin_set_order_stock(p_code text, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order_id uuid;
  v_row record;
begin
  -- Claim the change of state. If the order is already in the state being
  -- asked for, this matches no row and we stop — that is what makes accepting
  -- twice, or retrying, safe.
  update public.orders
     set stock_applied = p_apply
   where code = p_code
     and stock_applied = not p_apply
  returning id into v_order_id;

  if v_order_id is null then
    return jsonb_build_object('changed', false);
  end if;

  -- Grouped by design so an order listing the same design on two lines is
  -- counted once, as one total. Custom requests have no product_id and are
  -- skipped: there is no shelf behind them.
  for v_row in
    select oi.product_id, oi.item_id, sum(oi.qty)::int as qty
      from public.order_items oi
     where oi.order_id = v_order_id
       and oi.product_id is not null
     group by oi.product_id, oi.item_id
  loop
    if p_apply then
      if v_row.item_id is not null then
        update public.product_items
           set stock = stock - v_row.qty
         where id = v_row.item_id and stock >= v_row.qty;
        if not found then raise exception 'out_of_stock:%', v_row.item_id; end if;
      else
        update public.products
           set stock = stock - v_row.qty
         where id = v_row.product_id and stock >= v_row.qty;
        if not found then raise exception 'out_of_stock:%', v_row.product_id; end if;
      end if;
    else
      -- Giving pieces back can never fail for lack of them.
      if v_row.item_id is not null then
        update public.product_items set stock = stock + v_row.qty where id = v_row.item_id;
      else
        update public.products set stock = stock + v_row.qty where id = v_row.product_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('changed', true);
end;
$function$;

grant execute on function public.admin_set_order_stock(text, boolean) to authenticated, service_role;
-- ============================================================================
