-- =============================================================================
-- rofoof.iq — backend functions, storage bucket & grants
-- Run AFTER 0001_init.sql. Safe to re-run (idempotent where possible).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Admin helper (also defined in 0001; repeated here so 0002 is self-contained)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. Storage bucket for product images (public read, admin write)
--    Public bucket so next/image can load object URLs directly; 5 MB cap;
--    image MIME types only.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product-images public read"   on storage.objects;
drop policy if exists "product-images admin insert"  on storage.objects;
drop policy if exists "product-images admin update"  on storage.objects;
drop policy if exists "product-images admin delete"  on storage.objects;

-- Anyone can read (public storefront images).
create policy "product-images public read" on storage.objects
  for select using (bucket_id = 'product-images');

-- Only admins (profiles.role = 'admin') can upload / replace / delete.
create policy "product-images admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product-images admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. place_order() — atomic checkout. Prices are computed server-side from the
--    products table (never trust client totals). Attaches the order to the
--    signed-in user (auth.uid()) or leaves it as a guest order.
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_customer_name text,
  p_customer_phone text,
  p_province_code text,
  p_address_line text,
  p_notes text,
  p_coupon_code text,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_code     text;
  v_total    int;
  v_discount int := 0;
  v_coupon   text := null;
  v_item     jsonb;
  v_qty      int;
  v_prod     public.products%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items';
  end if;

  -- Resolve a valid coupon (else leave null so the FK stays satisfied).
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select code into v_coupon
    from public.coupons
    where code = upper(btrim(p_coupon_code))
      and active
      and (ends_at is null or ends_at > now());
  end if;

  insert into public.orders (
    user_id, customer_name, customer_phone, province_code,
    address_line, notes, coupon_code, status
  ) values (
    auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    p_province_code, p_address_line, p_notes, v_coupon, 'review'
  )
  returning id, code into v_order_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));

    select * into v_prod
    from public.products
    where id = (v_item->>'product_id') and is_active = true;

    if v_prod.id is null then
      raise exception 'invalid_product %', v_item->>'product_id';
    end if;

    insert into public.order_items (
      order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty, note
    ) values (
      v_order_id, v_prod.id, v_prod.name_ar, v_prod.name_en, v_prod.price, v_qty,
      nullif(btrim(coalesce(v_item->>'note','')), '')
    );
  end loop;

  -- Subtotal is maintained by the order_items trigger; apply the coupon now.
  if v_coupon is not null then
    select case when c.discount_type = 'percent'
                then floor(o.subtotal * c.value / 100.0)::int
                else c.value end
    into v_discount
    from public.coupons c
    join public.orders o on o.id = v_order_id
    where c.code = v_coupon and o.subtotal >= c.min_subtotal;

    update public.orders
    set discount_total = least(coalesce(v_discount, 0), subtotal)
    where id = v_order_id;
  end if;

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end;
$$;

grant execute on function public.place_order(text, text, text, text, text, text, jsonb)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. dashboard_stats() — KPI aggregation (admin only)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select jsonb_build_object(
    'in_stock',       (select count(*) from public.products where is_active and stock > 0),
    'total_products', (select count(*) from public.products),
    'new_users',      (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_orders',  (select count(*) from public.orders where status in ('review','accepted','shipped')),
    'revenue',        (select coalesce(sum(total), 0) from public.orders where status <> 'review')
  ) into v;

  return v;
end;
$$;

grant execute on function public.dashboard_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. admin_customers() — customers derived from orders (admin only)
-- ----------------------------------------------------------------------------
create or replace function public.admin_customers(p_limit int default 200, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v
  from (
    select
      md5(lower(customer_phone))                                as id,
      (array_agg(customer_name order by created_at desc))[1]    as name,
      customer_phone                                            as phone,
      (array_agg(province_code order by created_at desc))[1]    as province_code,
      (array_agg(address_line  order by created_at desc))[1]    as address,
      (array_agg(status        order by created_at desc))[1]    as status,
      count(*)::int                                             as orders
    from public.orders
    group by customer_phone
    order by max(created_at) desc
    limit greatest(1, least(p_limit, 500))
    offset greatest(0, p_offset)
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_customers(int, int) to authenticated;

-- =============================================================================
-- 5. Bootstrap your admin account (run once, after you sign up in the app)
--    Replace the email with the one you registered with.
-- =============================================================================
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'you@example.com');
