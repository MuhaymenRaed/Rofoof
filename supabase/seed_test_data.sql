-- =============================================================================
-- rofoof — DUMMY TEST DATA for the dashboard & storefront (idempotent-ish:
-- products/links/reviews/favorites use ON CONFLICT; the orders block APPENDS
-- 28 orders each run, so run it once — or delete test orders first with:
--   delete from public.orders where address_line like 'عنوان تجريبي%';
--
-- Prerequisites: 0009 (images + lookups) and 0010 (categories/discounts) ran.
-- Run in the Supabase SQL editor (postgres role bypasses RLS).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. PRODUCTS — variety to light up every dashboard state:
--    discounts, low stock (1–5), out of stock (0), inactive, bestsellers…
-- ----------------------------------------------------------------------------
insert into public.products
  (id, name_ar, name_en, sub_ar, sub_en, description_ar, description_en,
   price, discount_percent, emoji, color, category_code, badge, tags,
   waterproof, sold_out, is_active, stock, sort_order) values
('test-jjk-pack','باكج ستكرز جوجوتسو','Jujutsu Kaisen Pack','15 ستكر','15 stickers','ستكرات جوجوتسو كايسن بجودة عالية.','High-quality JJK stickers.',4500,20,'🌀','#5e35b1','stickers','bestseller',array['Anime','JJK'],true,false,true,35,30),
('test-mario-pack','ستكرز سوبر ماريو','Super Mario Pack','12 ستكر','12 stickers','ستكرات سوبر ماريو الكلاسيكية.','Classic Super Mario stickers.',4000,0,'🍄','#e53935','stickers',null,array['Gaming','Mario'],false,false,true,28,29),
('test-zelda-poster','بوستر زيلدا A3','Zelda Poster A3','طباعة فاخرة','Premium print','بوستر زيلدا تيرز أوف ذا كينغدوم.','Zelda: Tears of the Kingdom poster.',10000,15,'🗡️','#43a047','posters','new',array['Gaming','Zelda'],false,false,true,4,28),
('test-onepiece-poster','بوستر ون بيس غير','One Piece Gear 5 Poster','A3 لامع','A3 glossy','بوستر لوفي غير 5 بألوان مبهرة.','Luffy Gear 5 poster, vivid colors.',9500,25,'☀️','#f9a825','posters','bestseller',array['Anime','One Piece'],true,false,true,12,27),
('test-hxh-brooch','بروش هانتر','Hunter x Hunter Brooch','معدني','Metal','بروش غون وكيلوا المعدني.','Gon & Killua metal brooch.',13000,0,'🎣','#00897b','brooches',null,array['Anime','HxH'],false,false,true,2,26),
('test-pokemon-medal','ميدالية بوكيمون 3D','Pokéball 3D Medal','طباعة ثلاثية الأبعاد','3D printed','ميدالية بوكي بول ثلاثية الأبعاد.','3D-printed Pokéball medal.',14000,10,'⚪','#c62828','medals','new',array['Gaming','Pokemon'],false,false,true,15,25),
('test-berserk-poster','بوستر بيرسيرك','Berserk Poster A3','ورق ماط','Matte paper','بوستر غاتس من بيرسيرك.','Guts from Berserk poster.',11000,0,'⚔️','#37474f','posters',null,array['Anime','Berserk'],false,false,true,0,24),
('test-fc-stickers','ستكرز أندية كرة القدم','Football Clubs Stickers','20 ستكر','20 stickers','شعارات أشهر الأندية العالمية.','Top world football club crests.',3500,30,'⚽','#2e7d32','stickers','bestseller',array['Football','Local'],true,false,true,50,23),
('test-cyberpunk-medal','ميدالية سايبربانك 3D','Cyberpunk 3D Medal','إصدار خاص','Special edition','ميدالية سايبربانك 2077 المميزة.','Cyberpunk 2077 special medal.',16000,0,'🤖','#f9a825','medals',null,array['Gaming','Cyberpunk'],false,false,false,10,22),
('test-ghibli-pack','باكج ستكرز جيبلي','Studio Ghibli Pack','18 ستكر','18 stickers','ستكرات أفلام جيبلي الساحرة.','Magical Studio Ghibli stickers.',5000,35,'🍃','#66bb6a','stickers','bestseller',array['Anime','Ghibli'],true,false,true,3,21)
on conflict (id) do nothing;

-- Multi-category links (some products live in 2 categories)
insert into public.product_categories (product_id, category_code) values
  ('test-jjk-pack','stickers'), ('test-mario-pack','stickers'),
  ('test-zelda-poster','posters'), ('test-onepiece-poster','posters'), ('test-onepiece-poster','stickers'),
  ('test-hxh-brooch','brooches'), ('test-pokemon-medal','medals'),
  ('test-berserk-poster','posters'), ('test-fc-stickers','stickers'),
  ('test-cyberpunk-medal','medals'), ('test-ghibli-pack','stickers'), ('test-ghibli-pack','posters')
on conflict (product_id, category_code) do nothing;

-- Fandom links
insert into public.product_fandoms (product_id, fandom_code) values
  ('test-jjk-pack','anime'), ('test-mario-pack','gaming'), ('test-zelda-poster','gaming'),
  ('test-onepiece-poster','anime'), ('test-hxh-brooch','anime'), ('test-pokemon-medal','gaming'),
  ('test-berserk-poster','anime'), ('test-fc-stickers','local'), ('test-cyberpunk-medal','gaming'),
  ('test-ghibli-pack','anime')
on conflict (product_id, fandom_code) do nothing;

-- An extra coupon + an expired one (tests the coupon read policy)
insert into public.coupons (code, discount_type, value, min_subtotal, active, ends_at) values
  ('SUMMER25','percent',25,10000,true, now() + interval '30 days'),
  ('OLD10','percent',10,0,false, now() - interval '1 day')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 2. ORDERS — 28 guest orders spread over the last 12 days, all statuses,
--    varied customers/provinces, 1–3 items each, every 5th uses ROFOOF10.
--    Feeds: weekly revenue chart, KPIs, kanban, customers tab, tracking.
-- ----------------------------------------------------------------------------
do $$
declare
  v_names  text[] := array['أحمد محمد','زينب علي','سامر حسن','لينا ياسر','كريم طاهر','هدى عبدالله','مصطفى وليد','رنا فؤاد','عمر صلاح','دعاء كريم','ياسين جابر','سارة منير'];
  v_phones text[] := array['+9647501234567','+9647719876543','+9647805551234','+9647702223344','+9647514445566','+9647723339911','+9647508887766','+9647716543210','+9647801212323','+9647709090808','+9647510102020','+9647723134141'];
  v_provs  text[] := array['baghdad','basra','erbil','najaf','nineveh','karbala','kirkuk','babil','diyala','wasit','dhiqar','anbar'];
  v_prods  text[] := array['test-jjk-pack','test-mario-pack','test-zelda-poster','test-onepiece-poster','test-hxh-brooch','test-pokemon-medal','test-fc-stickers','test-ghibli-pack'];
  v_statuses public.order_status[] := array['review','accepted','shipped','delivered','delivered','shipped'];
  v_order_id uuid;
  v_prod public.products%rowtype;
  v_ci int; v_pi int; v_qty int; v_items int;
  i int; j int;
begin
  for i in 1..28 loop
    v_ci := 1 + (i % array_length(v_names, 1));

    insert into public.orders
      (user_id, customer_name, customer_phone, province_code, address_line,
       status, coupon_code, created_at)
    values
      (null, v_names[v_ci], v_phones[v_ci], v_provs[v_ci],
       'عنوان تجريبي - حي ' || i,
       v_statuses[1 + (i % array_length(v_statuses, 1))],
       case when i % 5 = 0 then 'ROFOOF10' else null end,
       now() - ((i % 12) || ' days')::interval - ((i * 137 % 20) || ' hours')::interval)
    returning id into v_order_id;

    v_items := 1 + (i % 3);
    for j in 1..v_items loop
      v_pi := 1 + ((i + j * 3) % array_length(v_prods, 1));
      select * into v_prod from public.products where id = v_prods[v_pi];
      if v_prod.id is not null then
        v_qty := 1 + ((i + j) % 3);
        insert into public.order_items
          (order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty)
        values
          (v_order_id, v_prod.id, v_prod.name_ar, v_prod.name_en,
           floor(v_prod.price * (100 - coalesce(v_prod.discount_percent, 0)) / 100.0)::int,
           v_qty);
      end if;
    end loop;

    -- apply the coupon discount to every 5th order
    if i % 5 = 0 then
      update public.orders set discount_total = floor(subtotal * 0.10) where id = v_order_id;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. REVIEWS — from your existing auth users; the trigger recomputes each
--    product's rating + reviews_count automatically.
-- ----------------------------------------------------------------------------
insert into public.reviews (product_id, user_id, rating, body)
select p.id, u.id, 3 + (abs(hashtext(p.id || u.id::text)) % 3), 'منتج رائع، جودة ممتازة 👍'
from (select id from public.products where id like 'test-%' limit 6) p
cross join (select id from auth.users limit 3) u
on conflict (product_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. FAVORITES — for your existing users (tests wishlist merge on login)
-- ----------------------------------------------------------------------------
insert into public.favorites (user_id, product_id)
select u.id, p.id
from (select id from auth.users limit 2) u
cross join (select id from public.products where id like 'test-%' limit 4) p
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------------------
-- select count(*) products from public.products;
-- select status, count(*) from public.orders group by 1;
-- select * from public.daily_revenue order by day desc limit 12;
-- select public.dashboard_stats();  -- run while signed in as admin via the app
