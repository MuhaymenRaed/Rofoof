-- =============================================================================
-- rofoof.iq — initial Supabase schema
-- Postgres / Supabase. Maps 1:1 to the frontend models in lib/products.ts.
-- Run in the Supabase SQL editor or via `supabase db push`.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. Enums (fixed taxonomies that match the TypeScript unions)
-- ----------------------------------------------------------------------------
create type badge_type   as enum ('bestseller', 'new', 'waterproof');
create type order_status as enum ('review', 'accepted', 'shipped', 'delivered');
create type coupon_type  as enum ('percent', 'fixed');
create type user_role    as enum ('customer', 'admin');

-- ----------------------------------------------------------------------------
-- 2. Utility: keep updated_at fresh
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Sequences for human-readable order / tracking codes (continue past seed data).
create sequence if not exists public.order_code_seq    start 8844;
create sequence if not exists public.tracking_code_seq start 772342;

-- ----------------------------------------------------------------------------
-- 3. Lookup tables (editable taxonomies + delivery + coupons)
-- ----------------------------------------------------------------------------
create table public.provinces (
  code      text primary key,           -- e.g. 'baghdad'
  name_ar   text not null,
  name_en   text not null,
  sort_order int not null default 0
);

create table public.categories (
  code       text primary key,          -- 'stickers' | 'posters' | 'brooches' | 'medals'
  name_ar    text not null,
  name_en    text not null,
  icon       text not null default 'grid',
  sort_order int  not null default 0
);

create table public.fandoms (
  code       text primary key,          -- 'gaming' | 'anime' | 'memes' | 'local'
  name_ar    text not null,
  name_en    text not null,
  sort_order int  not null default 0
);

create table public.coupons (
  code          text primary key,       -- e.g. 'ROFOOF10'
  discount_type coupon_type not null,
  value         int  not null check (value >= 0),
  min_subtotal  int  not null default 0,
  active        boolean not null default true,
  usage_limit   int,                    -- null = unlimited
  used_count    int  not null default 0,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. Profiles (1:1 with auth.users) + admin helper
-- ----------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  full_name            text,
  phone                text,
  role                 user_role not null default 'customer',
  default_province_code text references public.provinces (code) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current request an admin? Used by RLS write policies.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Catalog: products + their fandoms
-- ----------------------------------------------------------------------------
create table public.products (
  id            text primary key,                 -- slug, e.g. 'minecraft-pack'
  name_ar       text not null,
  name_en       text not null,
  sub_ar        text not null default '',
  sub_en        text not null default '',
  description_ar text not null default '',
  description_en text not null default '',
  price         int  not null check (price >= 0), -- IQD, no decimals
  emoji         text not null default '📦',
  image_url     text,                             -- future: real product image
  color         text not null default '#e8321a',  -- accent (hex)
  category_code text not null references public.categories (code) on delete restrict,
  badge         badge_type,
  tags          text[] not null default '{}',
  waterproof    boolean not null default false,
  sold_out      boolean not null default false,
  is_active     boolean not null default true,
  stock         int  not null default 0 check (stock >= 0), -- powers "in stock" KPI

  rating        numeric(2,1) not null default 0 check (rating between 0 and 5),
  reviews_count int  not null default 0,
  sort_order    int  not null default 0,          -- "newest" ranking
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_fandoms (
  product_id  text not null references public.products (id) on delete cascade,
  fandom_code text not null references public.fandoms (code) on delete cascade,
  primary key (product_id, fandom_code)
);

-- ----------------------------------------------------------------------------
-- 6. Orders, items and status history
-- ----------------------------------------------------------------------------
create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('RFQ-' || nextval('public.order_code_seq')),
  user_id        uuid references auth.users (id) on delete set null, -- null = guest
  customer_name  text not null,
  customer_phone text not null,
  province_code  text references public.provinces (code) on delete set null,
  address_line   text,
  notes          text,
  status         order_status not null default 'review',
  coupon_code    text references public.coupons (code) on delete set null,
  subtotal       int  not null default 0 check (subtotal >= 0),
  discount_total int  not null default 0 check (discount_total >= 0),
  delivery_fee   int  not null default 0 check (delivery_fee >= 0),
  -- total is always derived from the columns above:
  total          int  generated always as (subtotal - discount_total + delivery_fee) stored,
  tracking       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       text references public.products (id) on delete set null,
  name_ar_snapshot text not null,                 -- name captured at purchase time
  name_en_snapshot text not null,
  unit_price       int  not null check (unit_price >= 0),
  qty              int  not null check (qty > 0),
  note             text,                           -- custom text for this product
  line_total       int  generated always as (unit_price * qty) stored
);

create table public.order_status_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  status     order_status not null,
  note       text,
  created_at timestamptz not null default now()
);

-- Recompute the order subtotal whenever items change (definer: bypasses RLS).
create or replace function public.recalc_order_subtotal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update public.orders
     set subtotal = coalesce((select sum(line_total) from public.order_items where order_id = v_order), 0)
   where id = v_order;
  return null;
end;
$$;
create trigger trg_recalc_subtotal
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_subtotal();

-- Log status transitions into the history table.
create or replace function public.handle_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (order_id, status) values (new.id, new.status);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_events (order_id, status) values (new.id, new.status);
  end if;
  return null;
end;
$$;
create trigger trg_order_status
  after insert or update of status on public.orders
  for each row execute function public.handle_order_status();

-- Stamp a tracking code the first time an order is marked shipped.
create or replace function public.stamp_tracking()
returns trigger language plpgsql as $$
begin
  if new.status in ('shipped', 'delivered') and new.tracking is null then
    new.tracking := 'TRK-' || nextval('public.tracking_code_seq');
  end if;
  return new;
end;
$$;
create trigger trg_stamp_tracking
  before insert or update on public.orders
  for each row execute function public.stamp_tracking();

-- ----------------------------------------------------------------------------
-- 7. Favorites, carts, addresses, reviews
-- ----------------------------------------------------------------------------
create table public.favorites (
  user_id    uuid not null references auth.users (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table public.carts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_carts_updated before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  qty        int  not null default 1 check (qty > 0),
  note       text,
  unique (cart_id, product_id)
);

create table public.addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text,
  province_code text references public.provinces (code) on delete set null,
  address_line  text not null,
  phone         text,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null references public.products (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     int  not null check (rating between 1 and 5),
  title      text,
  body       text,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);

-- Keep products.rating / reviews_count in sync with the reviews table.
create or replace function public.recalc_product_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pid text;
begin
  v_pid := coalesce(new.product_id, old.product_id);
  update public.products
     set reviews_count = (select count(*) from public.reviews where product_id = v_pid),
         rating        = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where product_id = v_pid), 0)
   where id = v_pid;
  return null;
end;
$$;
create trigger trg_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_product_rating();

-- ----------------------------------------------------------------------------
-- 7b. Store settings (single row) — editable announcement bar, etc.
-- ----------------------------------------------------------------------------
create table public.settings (
  id                  boolean primary key default true check (id), -- enforces 1 row
  announcement_ar     text,
  announcement_en     text,
  announcement_active boolean not null default true,
  promo_code          text references public.coupons (code) on delete set null,
  updated_at          timestamptz not null default now()
);
create trigger trg_settings_updated before update on public.settings
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 8. Indexes
-- ----------------------------------------------------------------------------
create index idx_products_category   on public.products (category_code);
create index idx_products_active      on public.products (is_active);
create index idx_products_sort        on public.products (sort_order desc);
create index idx_products_tags        on public.products using gin (tags);
create index idx_product_fandoms_f    on public.product_fandoms (fandom_code);
create index idx_orders_user          on public.orders (user_id);
create index idx_orders_status        on public.orders (status);
create index idx_order_items_order     on public.order_items (order_id);
create index idx_status_events_order   on public.order_status_events (order_id);
create index idx_favorites_user       on public.favorites (user_id);
create index idx_cart_items_cart       on public.cart_items (cart_id);
create index idx_reviews_product      on public.reviews (product_id);

-- ----------------------------------------------------------------------------
-- 9. Row-Level Security
--    Catalog = public read, admin write. User data = owner-scoped.
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

-- --- Catalog: anyone can read; only admins can write -------------------------
create policy "read provinces"  on public.provinces  for select using (true);
create policy "read categories" on public.categories for select using (true);
create policy "read fandoms"    on public.fandoms    for select using (true);
create policy "read fandom map" on public.product_fandoms for select using (true);
create policy "read products"   on public.products   for select using (is_active or public.is_admin());

create policy "admin write provinces"  on public.provinces      for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write categories" on public.categories     for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write fandoms"    on public.fandoms        for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write products"   on public.products       for all using (public.is_admin()) with check (public.is_admin());
create policy "admin write fandom map" on public.product_fandoms for all using (public.is_admin()) with check (public.is_admin());

-- --- Coupons: read active ones (codes are public marketing); admin writes -----
create policy "read active coupons" on public.coupons for select
  using (active and (ends_at is null or ends_at > now()));
create policy "admin write coupons" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Profiles ----------------------------------------------------------------
create policy "own profile read"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- --- Orders (own + guest insert; admin manages) ------------------------------
create policy "read own orders" on public.orders for select
  using (user_id = auth.uid() or public.is_admin());
create policy "create own/guest order" on public.orders for insert
  with check (user_id is not distinct from auth.uid());
create policy "admin update orders" on public.orders for update
  using (public.is_admin()) with check (public.is_admin());

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
create policy "admin delete order items" on public.order_items for delete using (public.is_admin());

create policy "read own status events" on public.order_status_events for select using (
  exists (select 1 from public.orders o
          where o.id = order_id and (o.user_id = auth.uid() or public.is_admin()))
);
create policy "admin write status events" on public.order_status_events for all
  using (public.is_admin()) with check (public.is_admin());

-- --- Favorites / cart / addresses (owner only) -------------------------------
create policy "own favorites" on public.favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own cart" on public.carts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own cart items" on public.cart_items for all using (
  exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid())
);

create policy "own addresses" on public.addresses for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- --- Reviews (public read, owner write) --------------------------------------
create policy "read reviews"   on public.reviews for select using (true);
create policy "insert own review" on public.reviews for insert with check (user_id = auth.uid());
create policy "update own review" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete using (user_id = auth.uid() or public.is_admin());

-- --- Settings (public read, admin write) -------------------------------------
create policy "read settings"  on public.settings for select using (true);
create policy "admin write settings" on public.settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9b. Analytics view (revenue per day) — respects RLS via security_invoker
-- ----------------------------------------------------------------------------
create or replace view public.daily_revenue
  with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day,
         sum(total)  as revenue,
         count(*)    as orders
  from public.orders
  where status <> 'review'
  group by 1
  order by 1;

-- ----------------------------------------------------------------------------
-- 10. RPC: track an order by code without exposing customer PII (for anon)
-- ----------------------------------------------------------------------------
create or replace function public.get_order_tracking(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code',       o.code,
    'status',     o.status,
    'total',      o.total,
    'tracking',   o.tracking,
    'created_at', o.created_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name_ar', i.name_ar_snapshot,
        'name_en', i.name_en_snapshot,
        'qty', i.qty,
        'line_total', i.line_total))
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('status', e.status, 'created_at', e.created_at)
                       order by e.created_at)
      from public.order_status_events e where e.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where upper(o.code) = upper(trim(p_code))
     or upper(o.tracking) = upper(trim(p_code))
  limit 1;
$$;
grant execute on function public.get_order_tracking(text) to anon, authenticated;

-- =============================================================================
-- 11. SEED DATA (matches lib/products.ts so the storefront works immediately)
-- =============================================================================

-- Iraqi governorates --------------------------------------------------------
insert into public.provinces (code, name_ar, name_en, sort_order) values
  ('baghdad','بغداد','Baghdad',1), ('basra','البصرة','Basra',2),
  ('nineveh','نينوى','Nineveh',3), ('erbil','أربيل','Erbil',4),
  ('najaf','النجف','Najaf',5), ('karbala','كربلاء','Karbala',6),
  ('kirkuk','كركوك','Kirkuk',7), ('anbar','الأنبار','Anbar',8),
  ('diyala','ديالى','Diyala',9), ('dhiqar','ذي قار','Dhi Qar',10),
  ('babil','بابل','Babil',11), ('wasit','واسط','Wasit',12),
  ('maysan','ميسان','Maysan',13), ('muthanna','المثنى','Muthanna',14),
  ('qadisiyah','القادسية','Qadisiyah',15), ('saladin','صلاح الدين','Saladin',16),
  ('sulaymaniyah','السليمانية','Sulaymaniyah',17), ('duhok','دهوك','Duhok',18);

-- Categories ----------------------------------------------------------------
insert into public.categories (code, name_ar, name_en, icon, sort_order) values
  ('stickers','ستكرات','Stickers','sticker',1),
  ('posters','بوسترات','Posters','photo',2),
  ('brooches','بروشات','Brooches','hexagon',3),
  ('medals','ميداليات 3D','3D Medals','cube',4);

-- Fandoms -------------------------------------------------------------------
insert into public.fandoms (code, name_ar, name_en, sort_order) values
  ('gaming','قيمنق','Gaming',1), ('anime','أنمي','Anime',2),
  ('memes','ميمز','Memes',3), ('local','محلي','Local',4);

-- Coupons -------------------------------------------------------------------
insert into public.coupons (code, discount_type, value, min_subtotal, active) values
  ('ROFOOF10','percent',10,0,true);

-- Products ------------------------------------------------------------------
insert into public.products
  (id, name_ar, name_en, sub_ar, sub_en, description_ar, description_en,
   price, emoji, color, category_code, badge, tags, waterproof, sold_out,
   rating, reviews_count, sort_order) values
('minecraft-pack','باكج ستكرز ماينكرافت','Minecraft Sticker Pack','12 ستكر لامع','12 glossy stickers',
 '12 ستكر ماينكرافت بجودة عالية، قابلة للاستخدام على الدفاتر والأجهزة واللابتوب.','12 high-quality Minecraft stickers, perfect for notebooks, phones and laptops.',
 3500,'🎮','#4caf50','stickers','bestseller', array['Gaming','Minecraft'], false,false,4.9,142,6),
('minecraft-waterproof','ستكرز ماينكرافت مقاوم للماء','Minecraft Waterproof Pack','16 ستكر فينيل','16 vinyl stickers',
 'ستكرات فينيل مقاومة للماء والخدش، تدوم طويلاً حتى مع الاستخدام اليومي.','Water- and scratch-resistant vinyl stickers that last through daily use.',
 5000,'🧊','#2e7d32','stickers','waterproof', array['Gaming','Waterproof'], true,false,4.8,88,9),
('miku-poster','بوستر هاتسوني ميكو A4','Hatsune Miku Poster A4','طباعة A4 ماط','A4 matte print',
 'بوستر هاتسوني ميكو بقياس A4 على ورق ماط فاخر بألوان زاهية لا تبهت.','A4 Hatsune Miku poster on premium matte stock with vivid, fade-proof colors.',
 8000,'🎵','#00897b','posters',null, array['Anime','Vocaloid'], false,false,4.9,67,7),
('teto-brooch','بروش كازانه تيتو','Kasane Teto Brooch','أكريليك لامع','Glossy acrylic',
 'بروش أكريليك لامع لشخصية كازانه تيتو مع دبوس معدني متين على الخلف.','Glossy acrylic Kasane Teto brooch with a sturdy metal pin backing.',
 12000,'🌸','#e91e8c','brooches','new', array['Anime','Brooch'], false,false,4.7,39,12),
('rdr2-poster','بوستر ريد ديد ريدمبشن','Red Dead Redemption Poster','طباعة A3','A3 print',
 'بوستر ريد ديد ريدمبشن 2 بقياس A3 يجسّد أجواء الغرب الأمريكي بدقة عالية.','A3 Red Dead Redemption 2 poster capturing the Wild West in crisp detail.',
 15000,'🤠','#b71c1c','posters',null, array['Gaming','Western'], false,false,4.8,51,8),
('rdr2-stickers','ستكرز Red Dead R2','RDR2 Sticker Pack','10 ستكرات','10 stickers',
 'باكج ستكرات Red Dead Redemption 2 مقاومة للماء بتصاميم حصرية.','Waterproof Red Dead Redemption 2 sticker pack with exclusive designs.',
 5000,'🐎','#c62828','stickers','waterproof', array['Gaming','Waterproof'], true,false,4.6,44,4),
('gojo-sheet','شيت ستكرز غوجو ساتورو','Gojo Satoru Sticker Sheet','شيت كامل','Full sheet',
 'شيت ستكرز كامل لشخصية غوجو ساتورو من جوجوتسو كايسن بقصّ دقيق.','Full Gojo Satoru sticker sheet from Jujutsu Kaisen with precise die-cuts.',
 6000,'👁️','#5e35b1','stickers',null, array['Anime','JJK'], false,false,4.9,73,5),
('iraqi-memes','باكج ستكرز ميمز عراقية','Iraqi Memes Sticker Pack','ميمز محلية','Local memes',
 'أشهر الميمز العراقية على ستكرات لاصقة — ضحك مضمون على لابتوبك.','The most iconic Iraqi memes as stickers — guaranteed laughs on your laptop.',
 4500,'😂','#f9a825','stickers','bestseller', array['Memes','Local'], false,false,5.0,211,10),
('miku-teto-a3','بوستر ميكو × تيتو A3','Miku × Teto Duo Poster A3','إصدار محدود','Limited edition',
 'بوستر ثنائي ميكو × تيتو إصدار محدود بقياس A3 — نفد المخزون مؤقتاً.','Limited-edition Miku × Teto duo A3 poster — temporarily sold out.',
 12000,'🎵','#7e57c2','posters','bestseller', array['Anime','Vocaloid'], false,true,4.9,98,11),
('creeper-3d','ميدالية كريم ماينكرافت 3D','Minecraft Creeper 3D Medal','طباعة ثلاثية الأبعاد','3D printed',
 'ميدالية كريم ماينكرافت مطبوعة ثلاثية الأبعاد مع سلسلة معدنية أنيقة.','3D-printed Minecraft Creeper medal with an elegant metal chain.',
 20000,'🟩','#43a047','medals',null, array['Gaming','3D Print'], false,false,4.8,33,9),
('anime-mega','ميجا باكج ستكرز أنمي','Anime Mega Sticker Pack','50 ستكر','50 stickers',
 '50 ستكر أنمي متنوعة من أشهر الأعمال بسعر مميز للمجموعة الكاملة.','50 assorted anime stickers from top series at a special bundle price.',
 7500,'✨','#8e24aa','stickers','bestseller', array['Anime','Bundle'], false,false,4.9,156,7),
('onepiece-wanted','بوستر ون بيس مطلوب','One Piece Wanted Poster','ورق عتيق','Vintage paper',
 'بوستر «مطلوب» بأسلوب ون بيس على ورق عتيق — اكتب اسمك ومكافأتك.','One Piece-style ''Wanted'' poster on vintage paper — add your name & bounty.',
 9000,'🏴‍☠️','#6d4c41','posters','bestseller', array['Anime','One Piece'], false,false,4.8,120,6),
('elden-brooch','طقم بروش إيلدن رينغ','Elden Ring Brooch Set','3 قطع معدنية','3 metal pieces',
 'طقم بروشات معدنية مستوحى من إيلدن رينغ — 3 قطع بتفاصيل مذهّبة.','Metal brooch set inspired by Elden Ring — 3 pieces with gilded detailing.',
 18000,'🌟','#f9a825','brooches',null, array['Gaming','Metal'], false,false,4.7,28,5),
('naruto-medal','ميدالية ناروتو 3D','Naruto 3D Medal','طباعة ثلاثية الأبعاد','3D printed',
 'ميدالية ناروتو مطبوعة ثلاثية الأبعاد بشعار كونوها وحبل مجدول.','3D-printed Naruto medal featuring the Konoha crest on a braided cord.',
 10000,'🍥','#ef6c00','medals','new', array['Anime','3D Print'], false,false,4.8,41,11);

-- Product ↔ fandom links ----------------------------------------------------
insert into public.product_fandoms (product_id, fandom_code) values
  ('minecraft-pack','gaming'), ('minecraft-waterproof','gaming'),
  ('miku-poster','anime'), ('teto-brooch','anime'),
  ('rdr2-poster','gaming'), ('rdr2-stickers','gaming'),
  ('gojo-sheet','anime'),
  ('iraqi-memes','memes'), ('iraqi-memes','local'),
  ('miku-teto-a3','anime'), ('creeper-3d','gaming'),
  ('anime-mega','anime'), ('onepiece-wanted','anime'),
  ('elden-brooch','gaming'), ('naruto-medal','anime');

-- Stock levels (sold-out items get 0) ---------------------------------------
update public.products set stock = 25 where not sold_out;
update public.products set stock = 0  where sold_out;

-- Store settings (single row) -----------------------------------------------
insert into public.settings (id, announcement_ar, announcement_en, promo_code) values
  (true,
   'كود خصم ROFOOF10 — بوسترات ميكو × تيتو متوفرة الآن',
   'Use code ROFOOF10 — Miku × Teto posters available now',
   'ROFOOF10');

-- =============================================================================
-- End of migration
-- =============================================================================
