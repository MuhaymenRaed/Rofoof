-- =============================================================================
-- rofoof.iq — Row-Level Security policies for ALL tables (idempotent)
-- Safe to run standalone or re-run. Requires the tables from 0001_init.sql.
-- Catalog/lookup = public read, admin write. User data = owner-scoped.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Admin helper (SECURITY DEFINER → can read profiles regardless of RLS)
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
-- Enable RLS on every table
-- ----------------------------------------------------------------------------
alter table public.provinces           enable row level security;
alter table public.categories          enable row level security;
alter table public.fandoms             enable row level security;
alter table public.coupons             enable row level security;
alter table public.products            enable row level security;
alter table public.product_fandoms     enable row level security;
alter table public.profiles            enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.order_status_events enable row level security;
alter table public.favorites           enable row level security;
alter table public.carts               enable row level security;
alter table public.cart_items          enable row level security;
alter table public.addresses           enable row level security;
alter table public.reviews             enable row level security;
alter table public.settings            enable row level security;

-- ============================ CATALOG (public read) ==========================

-- provinces
drop policy if exists "read provinces"        on public.provinces;
drop policy if exists "admin write provinces"  on public.provinces;
create policy "read provinces" on public.provinces for select using (true);
create policy "admin write provinces" on public.provinces for all
  using (public.is_admin()) with check (public.is_admin());

-- categories
drop policy if exists "read categories"        on public.categories;
drop policy if exists "admin write categories"  on public.categories;
create policy "read categories" on public.categories for select using (true);
create policy "admin write categories" on public.categories for all
  using (public.is_admin()) with check (public.is_admin());

-- fandoms
drop policy if exists "read fandoms"        on public.fandoms;
drop policy if exists "admin write fandoms"  on public.fandoms;
create policy "read fandoms" on public.fandoms for select using (true);
create policy "admin write fandoms" on public.fandoms for all
  using (public.is_admin()) with check (public.is_admin());

-- products (hide inactive from non-admins)
drop policy if exists "read products"        on public.products;
drop policy if exists "admin write products"  on public.products;
create policy "read products" on public.products for select
  using (is_active or public.is_admin());
create policy "admin write products" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- product_fandoms
drop policy if exists "read fandom map"        on public.product_fandoms;
drop policy if exists "admin write fandom map"  on public.product_fandoms;
create policy "read fandom map" on public.product_fandoms for select using (true);
create policy "admin write fandom map" on public.product_fandoms for all
  using (public.is_admin()) with check (public.is_admin());

-- coupons (only active ones are publicly visible)
drop policy if exists "read active coupons"  on public.coupons;
drop policy if exists "admin write coupons"   on public.coupons;
create policy "read active coupons" on public.coupons for select
  using (active and (ends_at is null or ends_at > now()));
create policy "admin write coupons" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================ PROFILES =======================================
drop policy if exists "own profile read"    on public.profiles;
drop policy if exists "own profile insert"  on public.profiles;
drop policy if exists "own profile update"  on public.profiles;
create policy "own profile read" on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy "own profile insert" on public.profiles for insert
  with check (id = auth.uid());
create policy "own profile update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================ ORDERS =========================================
drop policy if exists "read own orders"        on public.orders;
drop policy if exists "create own/guest order"  on public.orders;
drop policy if exists "admin update orders"     on public.orders;
create policy "read own orders" on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
create policy "create own/guest order" on public.orders for insert
  with check (user_id is not distinct from auth.uid());
create policy "admin update orders" on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

-- order_items
drop policy if exists "read own order items"    on public.order_items;
drop policy if exists "insert own order items"  on public.order_items;
drop policy if exists "admin change order items" on public.order_items;
drop policy if exists "admin delete order items" on public.order_items;
create policy "read own order items" on public.order_items for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "insert own order items" on public.order_items for insert with check (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id is not distinct from auth.uid()))
);
create policy "admin change order items" on public.order_items for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin delete order items" on public.order_items for delete
  using (public.is_admin());

-- order_status_events
drop policy if exists "read own status events"   on public.order_status_events;
drop policy if exists "admin write status events" on public.order_status_events;
create policy "read own status events" on public.order_status_events for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "admin write status events" on public.order_status_events for all
  using (public.is_admin()) with check (public.is_admin());

-- ============================ USER-OWNED =====================================

-- favorites
drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- carts
drop policy if exists "own cart" on public.carts;
create policy "own cart" on public.carts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- cart_items (via cart ownership)
drop policy if exists "own cart items" on public.cart_items;
create policy "own cart items" on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

-- addresses
drop policy if exists "own addresses" on public.addresses;
create policy "own addresses" on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================ REVIEWS (public read) ==========================
drop policy if exists "read reviews"      on public.reviews;
drop policy if exists "insert own review" on public.reviews;
drop policy if exists "update own review" on public.reviews;
drop policy if exists "delete own review" on public.reviews;
create policy "read reviews" on public.reviews for select using (true);
create policy "insert own review" on public.reviews for insert
  with check (user_id = auth.uid());
create policy "update own review" on public.reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete
  using (user_id = auth.uid() or public.is_admin());

-- ============================ SETTINGS (public read) =========================
drop policy if exists "read settings"        on public.settings;
drop policy if exists "admin write settings"  on public.settings;
create policy "read settings" on public.settings for select using (true);
create policy "admin write settings" on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Done. Verify with:
--   select tablename, count(*) from pg_policies where schemaname='public'
--   group by tablename order by 1;
-- =============================================================================
