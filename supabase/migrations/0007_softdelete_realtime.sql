-- =============================================================================
-- rofoof — soft delete + server-side sync + Realtime (idempotent).
-- After this, the frontend just SELECTs: RLS hides soft-deleted rows, triggers
-- keep aggregates (rating, totals, stock, sold_out) correct, and Realtime
-- broadcasts changes. Run once in the Supabase SQL editor.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add is_deleted + deleted_at to EVERY table
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'provinces','categories','fandoms','coupons','products','product_fandoms',
    'profiles','orders','order_items','order_status_events','favorites',
    'carts','cart_items','addresses','reviews','settings'
  ] loop
    execute format('alter table public.%I add column if not exists is_deleted boolean not null default false', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
  end loop;
end $$;

-- Partial indexes for the "live" (non-deleted) hot paths
create index if not exists idx_products_live on public.products (sort_order desc) where not is_deleted;
create index if not exists idx_orders_live   on public.orders   (created_at desc) where not is_deleted;
create index if not exists idx_reviews_live  on public.reviews  (product_id)      where not is_deleted;

-- ----------------------------------------------------------------------------
-- 2. Link auth.users -> profiles (kept in sync, soft-delete aware)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, default_province_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'province_code', '')
  )
  on conflict (id) do update
    set full_name             = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone                 = coalesce(excluded.phone, public.profiles.phone),
        default_province_code = coalesce(excluded.default_province_code, public.profiles.default_province_code),
        is_deleted            = false,   -- re-activate the profile if the user signs up again
        deleted_at            = null;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check now ignores soft-deleted profiles
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and not is_deleted
  );
$$;

-- ----------------------------------------------------------------------------
-- 3. Read policies exclude soft-deleted rows (frontend selects stay unchanged)
-- ----------------------------------------------------------------------------
drop policy if exists "read provinces"       on public.provinces;
create policy "read provinces" on public.provinces for select using (not is_deleted);

drop policy if exists "read categories"      on public.categories;
create policy "read categories" on public.categories for select using (not is_deleted);

drop policy if exists "read fandoms"         on public.fandoms;
create policy "read fandoms" on public.fandoms for select using (not is_deleted);

drop policy if exists "read fandom map"      on public.product_fandoms;
create policy "read fandom map" on public.product_fandoms for select using (not is_deleted);

drop policy if exists "read products"        on public.products;
create policy "read products" on public.products for select
  using (not is_deleted and (is_active or public.is_admin()));

drop policy if exists "read active coupons"  on public.coupons;
create policy "read active coupons" on public.coupons for select
  using (not is_deleted and active and (ends_at is null or ends_at > now()));

drop policy if exists "own profile read"     on public.profiles;
create policy "own profile read" on public.profiles for select
  using (not is_deleted and (id = auth.uid() or public.is_admin()));

drop policy if exists "read own orders"      on public.orders;
create policy "read own orders" on public.orders for select
  using (not is_deleted and (user_id = auth.uid() or public.is_admin()));

drop policy if exists "read own order items" on public.order_items;
create policy "read own order items" on public.order_items for select using (
  not is_deleted and exists (
    select 1 from public.orders o
    where o.id = order_id and not o.is_deleted and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "read own status events" on public.order_status_events;
create policy "read own status events" on public.order_status_events for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and not o.is_deleted and (o.user_id = auth.uid() or public.is_admin()))
);

drop policy if exists "read reviews"         on public.reviews;
create policy "read reviews" on public.reviews for select using (not is_deleted);

drop policy if exists "read settings"        on public.settings;
create policy "read settings" on public.settings for select using (not is_deleted);

drop policy if exists "own addresses"        on public.addresses;
create policy "own addresses" on public.addresses for all
  using (user_id = auth.uid() and not is_deleted)
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 4. Aggregation triggers rewritten to ignore soft-deleted rows
-- ----------------------------------------------------------------------------
create or replace function public.recalc_order_subtotal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update public.orders
     set subtotal = coalesce((
       select sum(line_total) from public.order_items
       where order_id = v_order and not is_deleted), 0)
   where id = v_order;
  return null;
end; $$;

create or replace function public.recalc_product_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid text;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  update public.products
     set reviews_count = (select count(*) from public.reviews where product_id = v_pid and not is_deleted),
         rating        = coalesce((select round(avg(rating)::numeric, 1)
                                   from public.reviews where product_id = v_pid and not is_deleted), 0)
   where id = v_pid;
  return null;
end; $$;

-- Recompute subtotal / rating even when a row is soft-deleted (is_deleted flips)
drop trigger if exists trg_recalc_subtotal on public.order_items;
create trigger trg_recalc_subtotal
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_subtotal();

drop trigger if exists trg_recalc_rating on public.reviews;
create trigger trg_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_product_rating();

-- ----------------------------------------------------------------------------
-- 5. Stock kept in sync on the server (decrement on order, restore on cancel)
-- ----------------------------------------------------------------------------
-- Auto-flag sold_out when stock hits 0 (never un-flags a manual sell-out)
create or replace function public.sync_sold_out()
returns trigger language plpgsql as $$
begin
  if new.stock <= 0 then new.sold_out := true; end if;
  return new;
end; $$;

drop trigger if exists trg_sync_sold_out on public.products;
create trigger trg_sync_sold_out
  before insert or update of stock on public.products
  for each row execute function public.sync_sold_out();

-- Put stock back when an order is soft-deleted (cancelled)
create or replace function public.restore_stock_on_cancel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_deleted and not old.is_deleted then
    update public.products p
       set stock = p.stock + oi.qty
      from public.order_items oi
     where oi.order_id = new.id and oi.product_id = p.id and not oi.is_deleted;
  end if;
  return null;
end; $$;

drop trigger if exists trg_restore_stock on public.orders;
create trigger trg_restore_stock
  after update of is_deleted on public.orders
  for each row execute function public.restore_stock_on_cancel();

-- ----------------------------------------------------------------------------
-- 6. Server RPCs rewritten to be soft-delete aware
-- ----------------------------------------------------------------------------
create or replace function public.place_order(
  p_customer_name text, p_customer_phone text, p_province_code text,
  p_address_line text, p_notes text, p_coupon_code text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid; v_code text; v_total int; v_discount int := 0;
  v_coupon text := null; v_item jsonb; v_qty int; v_prod public.products%rowtype;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'no_items'; end if;

  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select code into v_coupon from public.coupons
    where code = upper(btrim(p_coupon_code)) and active and not is_deleted
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

    insert into public.order_items (order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty, note)
    values (v_order_id, v_prod.id, v_prod.name_ar, v_prod.name_en, v_prod.price, v_qty,
      nullif(btrim(coalesce(v_item->>'note','')), ''));

    -- decrement stock on the server (sync_sold_out handles sold_out)
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

create or replace function public.get_order_tracking(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'total', o.total, 'tracking', o.tracking,
    'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name_ar', i.name_ar_snapshot, 'name_en', i.name_en_snapshot,
        'qty', i.qty, 'line_total', i.line_total))
      from public.order_items i where i.order_id = o.id and not i.is_deleted), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'created_at', e.created_at)
        order by e.created_at)
      from public.order_status_events e where e.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where not o.is_deleted
    and (upper(o.code) = upper(trim(p_code)) or upper(o.tracking) = upper(trim(p_code)))
  limit 1;
$$;

create or replace function public.dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'in_stock',       (select count(*) from public.products where is_active and stock > 0 and not is_deleted),
    'total_products', (select count(*) from public.products where not is_deleted),
    'new_users',      (select count(*) from public.profiles where created_at > now() - interval '30 days' and not is_deleted),
    'active_orders',  (select count(*) from public.orders where status in ('review','accepted','shipped') and not is_deleted),
    'revenue',        (select coalesce(sum(total), 0) from public.orders where status <> 'review' and not is_deleted)
  ) into v;
  return v;
end; $$;

create or replace function public.admin_customers(p_limit int default 200, p_offset int default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select md5(lower(customer_phone)) as id,
      (array_agg(customer_name order by created_at desc))[1] as name,
      customer_phone as phone,
      (array_agg(province_code order by created_at desc))[1] as province_code,
      (array_agg(address_line  order by created_at desc))[1] as address,
      (array_agg(status        order by created_at desc))[1] as status,
      count(*)::int as orders
    from public.orders where not is_deleted
    group by customer_phone
    order by max(created_at) desc
    limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset)
  ) t;
  return v;
end; $$;

-- Revenue view ignores soft-deleted orders
create or replace view public.daily_revenue with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, sum(total) as revenue, count(*) as orders
  from public.orders where status <> 'review' and not is_deleted group by 1 order by 1;

-- ----------------------------------------------------------------------------
-- 7. Soft-delete / restore RPCs (use these instead of DELETE)
-- ----------------------------------------------------------------------------
create or replace function public.admin_soft_delete_product(p_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set is_deleted = true, deleted_at = now(), is_active = false where id = p_id;
  return found;
end; $$;

create or replace function public.admin_restore_product(p_id text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set is_deleted = false, deleted_at = null, is_active = true where id = p_id;
  return found;
end; $$;

create or replace function public.admin_deleted_products()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(row_to_json(p) order by (p.deleted_at)), '[]'::jsonb) into v
  from public.products p where p.is_deleted;
  return v;
end; $$;

-- Owner (or admin) cancels an order -> soft delete + stock restored by trigger
create or replace function public.cancel_order(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.orders set is_deleted = true, deleted_at = now()
  where code = p_code and not is_deleted and (user_id = auth.uid() or public.is_admin());
  return found;
end; $$;

-- Owner (or admin) removes their review (rating recomputed by trigger)
create or replace function public.soft_delete_review(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.reviews set is_deleted = true, deleted_at = now()
  where id = p_id and not is_deleted and (user_id = auth.uid() or public.is_admin());
  return found;
end; $$;

grant execute on function public.admin_soft_delete_product(text) to authenticated;
grant execute on function public.admin_restore_product(text)     to authenticated;
grant execute on function public.admin_deleted_products()        to authenticated;
grant execute on function public.cancel_order(text)              to authenticated;
grant execute on function public.soft_delete_review(uuid)        to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Realtime — broadcast changes to subscribed clients
-- ----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'products','orders','order_items','order_status_events','settings',
    'favorites','reviews','profiles','categories','fandoms','coupons'
  ] loop
    -- full row on updates/deletes so RLS + old-record filtering works in Realtime
    execute format('alter table public.%I replica identity full', t);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- =============================================================================
-- Done. No frontend query changes are needed — RLS now hides soft-deleted rows,
-- triggers keep rating/subtotal/stock/sold_out correct, and the tables above
-- stream live via Realtime. Use cancel_order() / admin_soft_delete_product()
-- instead of DELETE.
-- =============================================================================
