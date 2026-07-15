-- =============================================================================
-- rofoof — 0012: Package-based product architecture, tiered volume pricing,
-- and the conditional offer engine. Idempotent; run after 0001–0011.
--
--   • products.kind: 'standard' | 'package' | 'tiered' drives behavior
--   • product_items: selectable items inside a package (own image + price)
--   • product_price_tiers: qty→unit-price ladder for disk medals
--   • offers: bundle (buy X get Y), cart_percent, cart_delivery, flash (timed)
--   • order_items: item_id / waterproof / custom_image_url / free_qty
--   • place_order(): full server-side pricing engine (tiers, flash, bundles,
--     best-of coupon-vs-cart-offer, delivery offers) — client totals are
--     never trusted
--   • custom-artwork storage bucket for user-submitted poster images
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.product_kind as enum ('standard', 'package', 'tiered');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_kind as enum ('bundle', 'cart_percent', 'cart_delivery', 'flash');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. PRODUCTS — behavior flags
--    kind='standard'  → images are angles of one product, single price (medals)
--    kind='package'   → images are DISTINCT items the buyer picks from
--    kind='tiered'    → qty-based unit price from product_price_tiers (disks)
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists kind public.product_kind not null default 'standard';
alter table public.products
  add column if not exists waterproof_surcharge int not null default 0
  check (waterproof_surcharge >= 0);
alter table public.products
  add column if not exists allow_custom_image boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3. PRODUCT ITEMS — the selectable contents of a package.
--    price NULL → inherits the parent product's price (so a package can mix
--    "default-priced" and individually-priced items).
-- ----------------------------------------------------------------------------
create table if not exists public.product_items (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null references public.products (id) on delete cascade,
  image_url  text not null,
  name_ar    text not null default '',
  name_en    text not null default '',
  price      int check (price >= 0),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_product_items_product
  on public.product_items (product_id, sort_order) where not is_deleted;

-- ----------------------------------------------------------------------------
-- 4. PRICE TIERS — "1 → 4000, 2 → 3500, 3 → 3250, 4+ → 3000" per unit.
--    Resolution: the row with the greatest min_qty <= ordered qty wins.
-- ----------------------------------------------------------------------------
create table if not exists public.product_price_tiers (
  product_id text not null references public.products (id) on delete cascade,
  min_qty    int not null check (min_qty >= 1),
  unit_price int not null check (unit_price >= 0),
  primary key (product_id, min_qty)
);

-- ----------------------------------------------------------------------------
-- 5. OFFERS — the conditional discount engine. One table, four kinds, with a
--    CHECK constraint enforcing each kind's required shape:
--      bundle        product_id + buy_qty + free_qty        ("buy 2 get 1")
--      flash         product_id + percent + ends_at         (countdown sale)
--      cart_percent  min_cart_total + percent               ("> 20k → 30% off")
--      cart_delivery min_cart_total + delivery_fee          (free/cheap delivery)
--    user_id NULL = global; set = user-specific offer.
--    title_ar/title_en are the buyer-visible note on product/cart pages.
-- ----------------------------------------------------------------------------
create table if not exists public.offers (
  id             uuid primary key default gen_random_uuid(),
  kind           public.offer_kind not null,
  title_ar       text not null,
  title_en       text not null,
  product_id     text references public.products (id) on delete cascade,
  buy_qty        int check (buy_qty >= 1),
  free_qty       int check (free_qty >= 1),
  min_cart_total int check (min_cart_total >= 0),
  percent        int check (percent between 1 and 90),
  delivery_fee   int check (delivery_fee >= 0),
  user_id        uuid references auth.users (id) on delete cascade,
  starts_at      timestamptz,
  ends_at        timestamptz,
  active         boolean not null default true,
  is_deleted     boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint offers_shape check (
    (kind = 'bundle'        and product_id is not null and buy_qty is not null and free_qty is not null)
    or (kind = 'flash'         and product_id is not null and percent is not null and ends_at is not null)
    or (kind = 'cart_percent'  and min_cart_total is not null and percent is not null)
    or (kind = 'cart_delivery' and min_cart_total is not null and delivery_fee is not null)
  )
);
create index if not exists idx_offers_product on public.offers (product_id)
  where active and not is_deleted;

-- ----------------------------------------------------------------------------
-- 6. ORDER ITEMS — variant + customization + bundle-freebie columns.
--    line_total becomes unit_price × PAID quantity (free bundle units excluded
--    from money but still counted for stock).
-- ----------------------------------------------------------------------------
alter table public.order_items
  add column if not exists item_id uuid references public.product_items (id) on delete set null;
alter table public.order_items
  add column if not exists item_name_ar text;
alter table public.order_items
  add column if not exists item_name_en text;
alter table public.order_items
  add column if not exists waterproof boolean not null default false;
alter table public.order_items
  add column if not exists custom_image_url text;
alter table public.order_items
  add column if not exists free_qty int not null default 0 check (free_qty >= 0);

-- Recreate the generated column so bundle freebies aren't charged.
alter table public.order_items drop column if exists line_total;
alter table public.order_items
  add column line_total int generated always as (unit_price * greatest(qty - free_qty, 0)) stored;

-- Human-readable record of which offer/coupon the order benefited from.
alter table public.orders add column if not exists offer_note text;

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
alter table public.product_items       enable row level security;
alter table public.product_price_tiers enable row level security;
alter table public.offers              enable row level security;

drop policy if exists "read product items"        on public.product_items;
drop policy if exists "admin write product items" on public.product_items;
create policy "read product items" on public.product_items for select
  using (not is_deleted and (is_active or public.is_admin()));
create policy "admin write product items" on public.product_items for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read price tiers"        on public.product_price_tiers;
drop policy if exists "admin write price tiers" on public.product_price_tiers;
create policy "read price tiers" on public.product_price_tiers for select using (true);
create policy "admin write price tiers" on public.product_price_tiers for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read live offers"   on public.offers;
drop policy if exists "admin write offers" on public.offers;
-- Buyers see only live offers addressed to everyone or to them; admins see all.
create policy "read live offers" on public.offers for select using (
  public.is_admin() or (
    active and not is_deleted
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
    and (user_id is null or user_id = auth.uid())
  )
);
create policy "admin write offers" on public.offers for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. STORAGE — user-submitted poster artwork ("custom-artwork").
--    Guests must be able to order custom posters, so inserts are open to
--    anon+authenticated but constrained by MIME allow-list and a 10 MB cap;
--    only admins can modify/delete.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('custom-artwork', 'custom-artwork', true, 10485760,
  array['image/png','image/jpeg','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "custom-artwork public read"   on storage.objects;
drop policy if exists "custom-artwork public insert" on storage.objects;
drop policy if exists "custom-artwork admin update"  on storage.objects;
drop policy if exists "custom-artwork admin delete"  on storage.objects;
create policy "custom-artwork public read" on storage.objects
  for select using (bucket_id = 'custom-artwork');
create policy "custom-artwork public insert" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'custom-artwork');
create policy "custom-artwork admin update" on storage.objects
  for update to authenticated using (bucket_id = 'custom-artwork' and public.is_admin())
  with check (bucket_id = 'custom-artwork' and public.is_admin());
create policy "custom-artwork admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'custom-artwork' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. ADMIN RPCs — replace-set management for items and tiers
-- ----------------------------------------------------------------------------
create or replace function public.admin_set_product_items(p_id text, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
  v_new uuid;
  v_keep uuid[] := '{}';
  v_count int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  if p_items is not null then
    for v in select * from jsonb_array_elements(p_items) loop
      if coalesce(v->>'id', '') <> '' then
        update public.product_items set
          image_url  = coalesce(v->>'image_url', image_url),
          name_ar    = coalesce(v->>'name_ar', name_ar),
          name_en    = coalesce(v->>'name_en', name_en),
          price      = case when v ? 'price' then nullif(v->>'price','')::int else price end,
          sort_order = coalesce((v->>'sort_order')::int, sort_order),
          is_active  = coalesce((v->>'is_active')::boolean, is_active),
          is_deleted = false
        where id = (v->>'id')::uuid and product_id = p_id;
        v_keep := v_keep || (v->>'id')::uuid;
      else
        insert into public.product_items (product_id, image_url, name_ar, name_en, price, sort_order)
        values (p_id, v->>'image_url', coalesce(v->>'name_ar',''), coalesce(v->>'name_en',''),
                nullif(v->>'price','')::int, coalesce((v->>'sort_order')::int, 0))
        returning id into v_new;
        v_keep := v_keep || v_new;
      end if;
      v_count := v_count + 1;
    end loop;
  end if;

  -- Soft-delete items removed from the set (order history keeps its snapshot).
  update public.product_items set is_deleted = true, is_active = false
  where product_id = p_id and not (id = any(v_keep));

  return v_count;
end; $$;
grant execute on function public.admin_set_product_items(text, jsonb) to authenticated;

create or replace function public.admin_set_price_tiers(p_id text, p_tiers jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v jsonb; v_count int := 0;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.product_price_tiers where product_id = p_id;
  if p_tiers is not null then
    for v in select * from jsonb_array_elements(p_tiers) loop
      insert into public.product_price_tiers (product_id, min_qty, unit_price)
      values (p_id, (v->>'min_qty')::int, (v->>'unit_price')::int)
      on conflict (product_id, min_qty) do update set unit_price = excluded.unit_price;
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end; $$;
grant execute on function public.admin_set_price_tiers(text, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. place_order() v3 — the full pricing engine, entirely server-side.
--     Item entries: { product_id, item_id?, qty, note?, waterproof?,
--                     custom_image_url? }
--     Unit price resolution, in order:
--       1. tiered  → best matching tier for qty (fallback: product price)
--          package → item price, falling back to product price
--          standard→ product price
--       2. minus GREATEST(product.discount_percent, live flash %)  [not stacked]
--       3. plus waterproof surcharge when selected & offered
--     Line: bundle "buy B get F" → floor(qty/(B+F))×F units free.
--     Cart: best SINGLE money discount of (coupon, cart_percent offer);
--           cart_delivery applies independently. offer_note records what won.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_customer_name text, p_customer_phone text, p_province_code text,
  p_address_line text, p_notes text, p_coupon_code text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
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
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'no_items'; end if;

  insert into public.orders (user_id, customer_name, customer_phone, province_code,
    address_line, notes, status)
  values (auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    p_province_code, p_address_line, p_notes, 'review')
  returning id, code into v_order_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));

    select * into v_prod from public.products
    where id = (v_item->>'product_id') and is_active = true and not is_deleted;
    if v_prod.id is null then raise exception 'invalid_product %', v_item->>'product_id'; end if;

    -- package item selection
    v_item_id := null; v_pi := null;
    if coalesce(v_item->>'item_id', '') <> '' then
      select * into v_pi from public.product_items
      where id = (v_item->>'item_id')::uuid and product_id = v_prod.id
        and is_active and not is_deleted;
      if v_pi.id is null then raise exception 'invalid_item %', v_item->>'item_id'; end if;
      v_item_id := v_pi.id;
    end if;

    -- 1. base unit price
    if v_prod.kind = 'tiered' then
      select t.unit_price into v_unit
      from public.product_price_tiers t
      where t.product_id = v_prod.id and t.min_qty <= v_qty
      order by t.min_qty desc limit 1;
      v_unit := coalesce(v_unit, v_prod.price);
    else
      v_unit := coalesce(v_pi.price, v_prod.price);
    end if;

    -- 2. percent discount: better of product discount vs live flash sale
    select coalesce(max(o.percent), 0) into v_flash
    from public.offers o
    where o.kind = 'flash' and o.product_id = v_prod.id
      and o.active and not o.is_deleted
      and (o.starts_at is null or o.starts_at <= now()) and o.ends_at > now()
      and (o.user_id is null or o.user_id = auth.uid());
    v_pct := greatest(coalesce(v_prod.discount_percent, 0), v_flash);
    if v_pct > 0 then v_unit := floor(v_unit * (100 - v_pct) / 100.0)::int; end if;

    -- 3. waterproof option (surcharge only when the product offers it)
    v_waterproof := coalesce((v_item->>'waterproof')::boolean, false) and v_prod.waterproof;
    if v_waterproof then v_unit := v_unit + coalesce(v_prod.waterproof_surcharge, 0); end if;

    -- custom artwork (posters) — ignored unless the product allows it
    v_custom := nullif(left(btrim(coalesce(v_item->>'custom_image_url', '')), 500), '');
    if v_custom is not null and not v_prod.allow_custom_image then v_custom := null; end if;

    -- bundle: buy B get F free
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

    update public.products set stock = greatest(0, stock - v_qty) where id = v_prod.id;
  end loop;

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

  -- delivery offer applies independently of the money discount
  select * into v_delivery_offer from public.offers o
  where o.kind = 'cart_delivery' and o.active and not o.is_deleted
    and o.min_cart_total <= v_subtotal
    and (o.starts_at is null or o.starts_at <= now())
    and (o.ends_at is null or o.ends_at > now())
    and (o.user_id is null or o.user_id = auth.uid())
  order by o.delivery_fee asc limit 1;

  update public.orders set
    discount_total = least(v_offer_discount, subtotal),
    coupon_code    = v_applied_coupon,
    delivery_fee   = coalesce(v_delivery_offer.delivery_fee, delivery_fee),
    offer_note     = v_note
  where id = v_order_id;

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end; $$;
grant execute on function public.place_order(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 11. DATA MIGRATION — preserve everything already in the store
-- ----------------------------------------------------------------------------
-- Stickers / posters / brooches become packages…
update public.products p set kind = 'package'
where kind = 'standard' and exists (
  select 1 from public.product_categories pc
  where pc.product_id = p.id and pc.category_code in ('stickers', 'posters', 'brooches')
);

-- …and each of their existing images becomes a selectable item (inheriting the
-- product price via NULL) — only for products that don't have items yet.
insert into public.product_items (product_id, image_url, sort_order)
select p.id, u.img, u.ord - 1
from public.products p,
     unnest(p.images) with ordinality as u(img, ord)
where p.kind = 'package'
  and not exists (select 1 from public.product_items pi where pi.product_id = p.id);

-- Posters accept user-submitted artwork.
update public.products p set allow_custom_image = true
where exists (
  select 1 from public.product_categories pc
  where pc.product_id = p.id and pc.category_code = 'posters'
);

-- Disk medals (best-effort name match) become tiered…
update public.products set kind = 'tiered'
where kind <> 'tiered' and (name_ar like '%اقراص%' or name_en ilike '%disk%');

-- …with the requested ladder, for any tiered product that has no tiers yet.
insert into public.product_price_tiers (product_id, min_qty, unit_price)
select p.id, t.min_qty, t.unit_price
from public.products p
cross join (values (1, 4000), (2, 3500), (3, 3250), (4, 3000)) as t(min_qty, unit_price)
where p.kind = 'tiered'
  and not exists (select 1 from public.product_price_tiers x where x.product_id = p.id)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 12. REALTIME — stream the new tables (guarded)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['product_items', 'product_price_tiers', 'offers'] loop
      execute format('alter table public.%I replica identity full', t);
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- =============================================================================
-- Done. Verify:
--   select id, kind, allow_custom_image from public.products;
--   select * from public.product_items limit 20;
--   select * from public.product_price_tiers;
--   select kind, count(*) from public.offers group by 1;
-- =============================================================================
