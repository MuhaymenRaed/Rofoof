-- =============================================================================
-- rofoof — ONE-SHOT setup (idempotent). Safe to run on a DB that already has
-- the tables from 0001. Recreates functions, triggers, the revenue view, ALL
-- RLS policies, the product-images bucket, RPCs, the signup trigger, and seeds.
-- Paste the whole thing into Supabase → SQL Editor → Run.
-- =============================================================================

create extension if not exists pgcrypto;

-- Sequences (no-op if they already exist) -----------------------------------
create sequence if not exists public.order_code_seq    start 8845;
create sequence if not exists public.tracking_code_seq start 772342;

-- ============================ FUNCTIONS ======================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Persist signup metadata (name / phone / province) into profiles
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
        default_province_code = coalesce(excluded.default_province_code, public.profiles.default_province_code);
  return new;
end; $$;

create or replace function public.recalc_order_subtotal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update public.orders
     set subtotal = coalesce((select sum(line_total) from public.order_items where order_id = v_order), 0)
   where id = v_order;
  return null;
end; $$;

create or replace function public.handle_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (order_id, status) values (new.id, new.status);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.order_status_events (order_id, status) values (new.id, new.status);
  end if;
  return null;
end; $$;

create or replace function public.stamp_tracking()
returns trigger language plpgsql as $$
begin
  if new.status in ('shipped', 'delivered') and new.tracking is null then
    new.tracking := 'TRK-' || nextval('public.tracking_code_seq');
  end if;
  return new;
end; $$;

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
end; $$;

create or replace function public.get_order_tracking(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'total', o.total, 'tracking', o.tracking,
    'created_at', o.created_at,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name_ar', i.name_ar_snapshot, 'name_en', i.name_en_snapshot,
        'qty', i.qty, 'line_total', i.line_total))
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('status', e.status, 'created_at', e.created_at)
        order by e.created_at)
      from public.order_status_events e where e.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where upper(o.code) = upper(trim(p_code)) or upper(o.tracking) = upper(trim(p_code))
  limit 1;
$$;

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
    where code = upper(btrim(p_coupon_code)) and active and (ends_at is null or ends_at > now());
  end if;

  insert into public.orders (user_id, customer_name, customer_phone, province_code,
    address_line, notes, coupon_code, status)
  values (auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    p_province_code, p_address_line, p_notes, v_coupon, 'review')
  returning id, code into v_order_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(1, least(99, coalesce((v_item->>'qty')::int, 1)));
    select * into v_prod from public.products where id = (v_item->>'product_id') and is_active = true;
    if v_prod.id is null then raise exception 'invalid_product %', v_item->>'product_id'; end if;
    insert into public.order_items (order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty, note)
    values (v_order_id, v_prod.id, v_prod.name_ar, v_prod.name_en, v_prod.price, v_qty,
      nullif(btrim(coalesce(v_item->>'note','')), ''));
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

create or replace function public.dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
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
    from public.orders group by customer_phone
    order by max(created_at) desc
    limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset)
  ) t;
  return v;
end; $$;

-- ============================ TRIGGERS =======================================
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists trg_carts_updated on public.carts;
create trigger trg_carts_updated before update on public.carts for each row execute function public.set_updated_at();
drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated before update on public.settings for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists trg_recalc_subtotal on public.order_items;
create trigger trg_recalc_subtotal after insert or update or delete on public.order_items for each row execute function public.recalc_order_subtotal();
drop trigger if exists trg_order_status on public.orders;
create trigger trg_order_status after insert or update of status on public.orders for each row execute function public.handle_order_status();
drop trigger if exists trg_stamp_tracking on public.orders;
create trigger trg_stamp_tracking before insert or update on public.orders for each row execute function public.stamp_tracking();
drop trigger if exists trg_recalc_rating on public.reviews;
create trigger trg_recalc_rating after insert or update or delete on public.reviews for each row execute function public.recalc_product_rating();

-- ============================ VIEW ===========================================
create or replace view public.daily_revenue with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, sum(total) as revenue, count(*) as orders
  from public.orders where status <> 'review' group by 1 order by 1;

-- ============================ RLS ============================================
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

drop policy if exists "read provinces" on public.provinces;
drop policy if exists "admin write provinces" on public.provinces;
create policy "read provinces" on public.provinces for select using (true);
create policy "admin write provinces" on public.provinces for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read categories" on public.categories;
drop policy if exists "admin write categories" on public.categories;
create policy "read categories" on public.categories for select using (true);
create policy "admin write categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read fandoms" on public.fandoms;
drop policy if exists "admin write fandoms" on public.fandoms;
create policy "read fandoms" on public.fandoms for select using (true);
create policy "admin write fandoms" on public.fandoms for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read products" on public.products;
drop policy if exists "admin write products" on public.products;
create policy "read products" on public.products for select using (is_active or public.is_admin());
create policy "admin write products" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read fandom map" on public.product_fandoms;
drop policy if exists "admin write fandom map" on public.product_fandoms;
create policy "read fandom map" on public.product_fandoms for select using (true);
create policy "admin write fandom map" on public.product_fandoms for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read active coupons" on public.coupons;
drop policy if exists "admin write coupons" on public.coupons;
create policy "read active coupons" on public.coupons for select using (active and (ends_at is null or ends_at > now()));
create policy "admin write coupons" on public.coupons for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "own profile insert" on public.profiles for insert with check (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "read own orders" on public.orders;
drop policy if exists "create own/guest order" on public.orders;
drop policy if exists "admin update orders" on public.orders;
create policy "read own orders" on public.orders for select using (user_id = auth.uid() or public.is_admin());
create policy "create own/guest order" on public.orders for insert with check (user_id is not distinct from auth.uid());
create policy "admin update orders" on public.orders for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "read own order items" on public.order_items;
drop policy if exists "insert own order items" on public.order_items;
drop policy if exists "admin change order items" on public.order_items;
drop policy if exists "admin delete order items" on public.order_items;
create policy "read own order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy "insert own order items" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id is not distinct from auth.uid())));
create policy "admin change order items" on public.order_items for update using (public.is_admin()) with check (public.is_admin());
create policy "admin delete order items" on public.order_items for delete using (public.is_admin());

drop policy if exists "read own status events" on public.order_status_events;
drop policy if exists "admin write status events" on public.order_status_events;
create policy "read own status events" on public.order_status_events for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy "admin write status events" on public.order_status_events for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own cart" on public.carts;
create policy "own cart" on public.carts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own cart items" on public.cart_items;
create policy "own cart items" on public.cart_items for all
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = auth.uid()));

drop policy if exists "own addresses" on public.addresses;
create policy "own addresses" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "read reviews" on public.reviews;
drop policy if exists "insert own review" on public.reviews;
drop policy if exists "update own review" on public.reviews;
drop policy if exists "delete own review" on public.reviews;
create policy "read reviews" on public.reviews for select using (true);
create policy "insert own review" on public.reviews for insert with check (user_id = auth.uid());
create policy "update own review" on public.reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own review" on public.reviews for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists "read settings" on public.settings;
drop policy if exists "admin write settings" on public.settings;
create policy "read settings" on public.settings for select using (true);
create policy "admin write settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- ============================ STORAGE BUCKET =================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/avif','image/gif','image/svg+xml'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product-images public read"  on storage.objects;
drop policy if exists "product-images admin insert" on storage.objects;
drop policy if exists "product-images admin update" on storage.objects;
drop policy if exists "product-images admin delete" on storage.objects;
create policy "product-images public read" on storage.objects for select using (bucket_id = 'product-images');
create policy "product-images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ============================ GRANTS =========================================
grant execute on function public.get_order_tracking(text) to anon, authenticated;
grant execute on function public.place_order(text,text,text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.admin_customers(int,int) to authenticated;

-- ============================ SEED: lookups + settings =======================
insert into public.provinces (code, name_ar, name_en, sort_order) values
  ('baghdad','بغداد','Baghdad',1),('basra','البصرة','Basra',2),('nineveh','نينوى','Nineveh',3),
  ('erbil','أربيل','Erbil',4),('najaf','النجف','Najaf',5),('karbala','كربلاء','Karbala',6),
  ('kirkuk','كركوك','Kirkuk',7),('anbar','الأنبار','Anbar',8),('diyala','ديالى','Diyala',9),
  ('dhiqar','ذي قار','Dhi Qar',10),('babil','بابل','Babil',11),('wasit','واسط','Wasit',12),
  ('maysan','ميسان','Maysan',13),('muthanna','المثنى','Muthanna',14),('qadisiyah','القادسية','Qadisiyah',15),
  ('saladin','صلاح الدين','Saladin',16),('sulaymaniyah','السليمانية','Sulaymaniyah',17),('duhok','دهوك','Duhok',18)
on conflict (code) do nothing;

insert into public.categories (code, name_ar, name_en, icon, sort_order) values
  ('stickers','ستكرات','Stickers','sticker',1),('posters','بوسترات','Posters','photo',2),
  ('brooches','بروشات','Brooches','hexagon',3),('medals','ميداليات 3D','3D Medals','cube',4)
on conflict (code) do nothing;

insert into public.fandoms (code, name_ar, name_en, sort_order) values
  ('gaming','قيمنق','Gaming',1),('anime','أنمي','Anime',2),('memes','ميمز','Memes',3),('local','محلي','Local',4)
on conflict (code) do nothing;

insert into public.coupons (code, discount_type, value, min_subtotal, active) values
  ('ROFOOF10','percent',10,0,true)
on conflict (code) do nothing;

insert into public.settings (id, announcement_ar, announcement_en, promo_code) values
  (true, 'كود خصم ROFOOF10 — بوسترات ميكو × تيتو متوفرة الآن',
   'Use code ROFOOF10 — Miku × Teto posters available now', 'ROFOOF10')
on conflict (id) do nothing;

-- ============================ SEED: products =================================
insert into public.products
  (id, name_ar, name_en, sub_ar, sub_en, description_ar, description_en,
   price, emoji, color, category_code, badge, tags, waterproof, sold_out,
   stock, rating, reviews_count, sort_order) values
('aot-pack','باكج ستكرز هجوم العمالقة','Attack on Titan Sticker Pack','14 ستكر لامع','14 glossy stickers','باكج ستكرات هجوم العمالقة بجودة عالية.','High-quality Attack on Titan sticker pack.',4500,'⚔️','#546e7a','stickers','bestseller',array['Anime','AOT'],false,false,30,4.9,132,20),
('demon-slayer-pack','باكج ستكرز قاتل الشياطين','Demon Slayer Sticker Pack','16 ستكر','16 stickers','ستكرات قاتل الشياطين — تانجيرو ونيزوكو.','Demon Slayer stickers — Tanjiro and Nezuko.',4500,'🌊','#1e88e5','stickers','bestseller',array['Anime','Demon Slayer'],false,false,28,4.9,118,19),
('chainsaw-pack','ستكرز تشين سو مان','Chainsaw Man Sticker Pack','12 ستكر','12 stickers','ستكرات تشين سو مان مقاومة للماء.','Waterproof Chainsaw Man stickers.',4000,'🔺','#e53935','stickers','waterproof',array['Anime','Chainsaw Man'],true,false,26,4.7,76,15),
('spyfamily-pack','ستكرز عائلة التجسس','Spy x Family Sticker Pack','12 ستكر','12 stickers','ستكرات عائلة التجسس — آنيا ويورو.','Spy x Family stickers — Anya and Yor.',4000,'🥜','#43a047','stickers','new',array['Anime','Spy x Family'],false,false,24,4.8,64,18),
('valorant-pack','ستكرز فالورانت','Valorant Sticker Pack','10 ستكرات فينيل','10 vinyl stickers','ستكرات فالورانت فينيل مقاومة للماء.','Waterproof Valorant vinyl stickers.',5000,'🎯','#ff4655','stickers','waterproof',array['Gaming','Valorant'],true,false,22,4.8,91,16),
('genshin-pack','ستكرز جينشن إمباكت','Genshin Impact Sticker Pack','14 ستكر','14 stickers','ستكرات جينشن إمباكت بشخصيات تيفات.','Genshin Impact character stickers.',5000,'⭐','#4db6ac','stickers',null,array['Gaming','Genshin'],false,false,20,4.7,58,14),
('iraqi-sayings','ستكرز أقوال عراقية','Iraqi Sayings Stickers','ميمز محلية','Local memes','أشهر الأقوال والميمز العراقية.','Iconic Iraqi sayings and memes.',4000,'🗣️','#f9a825','stickers','bestseller',array['Local','Memes'],false,false,40,5.0,187,20),
('aot-poster','بوستر هجوم العمالقة A3','Attack on Titan Poster A3','طباعة A3 ماط','A3 matte print','بوستر هجوم العمالقة على ورق ماط فاخر.','Premium matte Attack on Titan poster.',9000,'🗡️','#455a64','posters','bestseller',array['Anime','AOT'],false,false,18,4.8,73,17),
('solo-leveling-poster','بوستر سولو ليفلنغ','Solo Leveling Poster A3','إصدار محدود','Limited edition','بوستر سولو ليفلنغ — إصدار محدود.','Solo Leveling poster — limited edition.',9000,'🌑','#5e35b1','posters','new',array['Anime','Solo Leveling'],false,false,15,4.9,88,19),
('frieren-poster','بوستر فريرن','Frieren Poster A3','طباعة A3','A3 print','بوستر فريرن بألوان مائية أنيقة.','Elegant watercolor Frieren poster.',8000,'✨','#26a69a','posters','new',array['Anime','Frieren'],false,false,17,4.8,45,18),
('gta-poster','بوستر جي تي أيه 6','GTA VI Poster','ورق لامع','Glossy paper','بوستر جي تي أيه 6 بأجواء فايس سيتي.','GTA VI poster with Vice City vibes.',10000,'🌴','#ec407a','posters',null,array['Gaming','GTA'],false,false,16,4.6,52,14),
('gojo-brooch','بروش غوجو','Gojo Satoru Brooch','أكريليك لامع','Glossy acrylic','بروش أكريليك لغوجو ساتورو.','Glossy acrylic Gojo Satoru brooch.',12000,'🔵','#5e35b1','brooches','bestseller',array['Anime','JJK'],false,false,19,4.9,64,17),
('nezuko-brooch','بروش نيزوكو','Nezuko Brooch','أكريليك','Acrylic','بروش نيزوكو بتفاصيل دقيقة.','Nezuko brooch with fine detail.',11000,'🎋','#ef6c00','brooches','new',array['Anime','Demon Slayer'],false,false,21,4.7,38,16),
('valorant-brooch','بروش فالورانت','Valorant Brooch','معدني','Metal','بروش معدني بشعار فالورانت.','Metal Valorant brooch.',13000,'🎯','#ff4655','brooches',null,array['Gaming','Valorant'],false,false,14,4.6,29,13),
('luffy-3d','ميدالية لوفي 3D','Luffy 3D Medal','طباعة ثلاثية الأبعاد','3D printed','ميدالية لوفي ثلاثية الأبعاد.','3D-printed Luffy medal.',15000,'🏴‍☠️','#6d4c41','medals','bestseller',array['Anime','One Piece','3D Print'],false,false,16,4.8,71,18),
('sung-jinwoo-3d','ميدالية سونغ جين وو 3D','Sung Jinwoo 3D Medal','طباعة ثلاثية الأبعاد','3D printed','ميدالية سونغ جين وو ثلاثية الأبعاد.','3D Sung Jinwoo medal.',18000,'⚔️','#4527a0','medals','new',array['Anime','Solo Leveling','3D Print'],false,false,12,4.9,49,19),
('iraq-flag-3d','ميدالية علم العراق 3D','Iraq Flag 3D Medal','طباعة ثلاثية الأبعاد','3D printed','ميدالية علم العراق صناعة محلية.','Locally made 3D Iraq flag medal.',12000,'🇮🇶','#2e7d32','medals',null,array['Local','3D Print'],false,false,30,4.9,96,17)
on conflict (id) do nothing;

insert into public.product_fandoms (product_id, fandom_code) values
  ('aot-pack','anime'),('demon-slayer-pack','anime'),('chainsaw-pack','anime'),('spyfamily-pack','anime'),
  ('valorant-pack','gaming'),('genshin-pack','gaming'),('iraqi-sayings','local'),('iraqi-sayings','memes'),
  ('aot-poster','anime'),('solo-leveling-poster','anime'),('frieren-poster','anime'),('gta-poster','gaming'),
  ('gojo-brooch','anime'),('nezuko-brooch','anime'),('valorant-brooch','gaming'),
  ('luffy-3d','anime'),('sung-jinwoo-3d','anime'),('iraq-flag-3d','local')
on conflict (product_id, fandom_code) do nothing;

-- =============================================================================
-- After running: make yourself admin (use the email you sign up with):
--   update public.profiles set role='admin'
--   where id = (select id from auth.users where email='you@example.com');
-- =============================================================================
