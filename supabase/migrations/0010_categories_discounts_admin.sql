-- =============================================================================
-- rofoof — multi-categories, discounts, admin CRUD, detailed dashboard stats.
-- Idempotent. Run once in the Supabase SQL editor (after apply_all / 0009).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. MULTI-CATEGORIES: product_categories junction (products.category_code
--    stays as the "primary" category = first of the list, for compatibility)
-- ----------------------------------------------------------------------------
create table if not exists public.product_categories (
  product_id    text not null references public.products (id) on delete cascade,
  category_code text not null references public.categories (code) on delete cascade,
  primary key (product_id, category_code)
);

alter table public.product_categories enable row level security;
drop policy if exists "read product categories"        on public.product_categories;
drop policy if exists "admin write product categories" on public.product_categories;
create policy "read product categories" on public.product_categories for select using (true);
create policy "admin write product categories" on public.product_categories for all
  using (public.is_admin()) with check (public.is_admin());

-- Backfill from the existing single category
insert into public.product_categories (product_id, category_code)
select id, category_code from public.products
on conflict (product_id, category_code) do nothing;

-- Replace a product's category list atomically (also syncs the primary column)
create or replace function public.admin_set_product_categories(p_id text, p_codes text[])
returns text[] language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  if p_codes is null or array_length(p_codes, 1) is null then raise exception 'no_categories'; end if;

  delete from public.product_categories where product_id = p_id;
  insert into public.product_categories (product_id, category_code)
    select p_id, unnest(p_codes) on conflict do nothing;
  update public.products set category_code = p_codes[1] where id = p_id;
  return p_codes;
end; $$;
grant execute on function public.admin_set_product_categories(text, text[]) to authenticated;

-- Admin creates a new category (code auto-slugged client-side)
create or replace function public.admin_create_category(p_code text, p_name_ar text, p_name_en text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.categories%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.categories (code, name_ar, name_en, icon, sort_order)
  values (p_code, p_name_ar, p_name_en, 'grid',
          coalesce((select max(sort_order) + 1 from public.categories), 1))
  on conflict (code) do update set name_ar = excluded.name_ar, name_en = excluded.name_en
  returning * into v;
  return jsonb_build_object('code', v.code, 'name_ar', v.name_ar, 'name_en', v.name_en, 'icon', v.icon);
end; $$;
grant execute on function public.admin_create_category(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. DISCOUNT SYSTEM: percentage per product, applied server-side at checkout
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists discount_percent int not null default 0
  check (discount_percent between 0 and 90);

-- Soft-delete columns (safety if 0007 wasn't run) + soft-delete-aware read
alter table public.products add column if not exists is_deleted boolean not null default false;
alter table public.products add column if not exists deleted_at timestamptz;

drop policy if exists "read products" on public.products;
create policy "read products" on public.products for select
  using (not is_deleted and (is_active or public.is_admin()));

-- Effective (discounted) price, single source of truth
create or replace function public.effective_price(p public.products)
returns int language sql immutable as $$
  select case when p.discount_percent > 0
              then floor(p.price * (100 - p.discount_percent) / 100.0)::int
              else p.price end;
$$;

-- ----------------------------------------------------------------------------
-- 3. place_order — charges the DISCOUNTED price, checks stock, soft-delete aware
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_customer_name text, p_customer_phone text, p_province_code text,
  p_address_line text, p_notes text, p_coupon_code text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid; v_code text; v_total int; v_discount int := 0;
  v_coupon text := null; v_item jsonb; v_qty int; v_unit int;
  v_prod public.products%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'no_items'; end if;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select code into v_coupon from public.coupons
    where code = upper(btrim(p_coupon_code)) and active
      and (ends_at is null or ends_at > now());
  end if;

  insert into public.orders (user_id, customer_name, customer_phone, province_code,
    address_line, notes, coupon_code, status)
  values (auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    p_province_code, p_address_line, p_notes, v_coupon, 'review')
  returning id, code into v_order_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));
    select * into v_prod from public.products
    where id = (v_item->>'product_id') and is_active = true and not is_deleted;
    if v_prod.id is null then raise exception 'invalid_product %', v_item->>'product_id'; end if;

    v_unit := public.effective_price(v_prod);

    insert into public.order_items (order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty, note)
    values (v_order_id, v_prod.id, v_prod.name_ar, v_prod.name_en, v_unit, v_qty,
      nullif(btrim(coalesce(v_item->>'note','')), ''));

    update public.products set stock = greatest(0, stock - v_qty) where id = v_prod.id;
  end loop;

  if v_coupon is not null then
    select case when c.discount_type = 'percent' then floor(o.subtotal * c.value / 100.0)::int else c.value end
    into v_discount from public.coupons c join public.orders o on o.id = v_order_id
    where c.code = v_coupon and o.subtotal >= c.min_subtotal;
    update public.orders set discount_total = least(coalesce(v_discount, 0), subtotal) where id = v_order_id;
  end if;

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end; $$;
grant execute on function public.place_order(text, text, text, text, text, text, jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. DETAILED dashboard stats (KPIs + top products) — admin only
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'in_stock',        (select count(*) from public.products where is_active and stock > 0 and not is_deleted),
    'total_products',  (select count(*) from public.products where not is_deleted),
    'low_stock',       (select count(*) from public.products where is_active and stock between 1 and 5 and not is_deleted),
    'out_of_stock',    (select count(*) from public.products where is_active and stock <= 0 and not is_deleted),
    'on_discount',     (select count(*) from public.products where is_active and discount_percent > 0 and not is_deleted),
    'new_users',       (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'total_customers', (select count(distinct customer_phone) from public.orders),
    'active_orders',   (select count(*) from public.orders where status in ('review','accepted','shipped')),
    'delivered_orders',(select count(*) from public.orders where status = 'delivered'),
    'total_orders',    (select count(*) from public.orders),
    'revenue',         (select coalesce(sum(total), 0) from public.orders where status <> 'review'),
    'revenue_30d',     (select coalesce(sum(total), 0) from public.orders
                        where status <> 'review' and created_at > now() - interval '30 days'),
    'avg_order',       (select coalesce(round(avg(total))::int, 0) from public.orders where status <> 'review'),
    'top_products',    coalesce((
      select jsonb_agg(t) from (
        select oi.product_id as id,
               oi.name_ar_snapshot as name_ar, oi.name_en_snapshot as name_en,
               sum(oi.qty)::int as sold, sum(oi.line_total)::int as revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.status <> 'review'
        group by 1, 2, 3
        order by sold desc
        limit 5
      ) t), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
grant execute on function public.dashboard_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Realtime for the new table (guarded)
-- ----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'product_categories'
  ) then
    alter publication supabase_realtime add table public.product_categories;
  end if;
end $$;

-- =============================================================================
-- Done. Products support multiple categories + discounts; checkout charges the
-- discounted price server-side; dashboard_stats returns detailed KPIs.
-- =============================================================================
