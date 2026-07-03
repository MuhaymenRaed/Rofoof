-- =============================================================================
-- rofoof — extra realistic catalog (rofoof.iq-style: anime / gaming / local).
-- Idempotent (on conflict do nothing). Replace emojis with real photos by
-- uploading to the `product-images` bucket and setting products.image_url.
-- =============================================================================

insert into public.products
  (id, name_ar, name_en, sub_ar, sub_en, description_ar, description_en,
   price, emoji, color, category_code, badge, tags, waterproof, sold_out,
   stock, rating, reviews_count, sort_order) values
-- ---- Stickers ----
('aot-pack','باكج ستكرز هجوم العمالقة','Attack on Titan Sticker Pack','14 ستكر لامع','14 glossy stickers',
 'باكج ستكرات هجوم العمالقة بتصاميم فيلق الاستطلاع بجودة عالية.','Attack on Titan sticker pack featuring the Survey Corps, premium quality.',
 4500,'⚔️','#546e7a','stickers','bestseller', array['Anime','AOT'], false,false,30,4.9,132,20),
('demon-slayer-pack','باكج ستكرز قاتل الشياطين','Demon Slayer Sticker Pack','16 ستكر','16 stickers',
 'ستكرات قاتل الشياطين — تانجيرو، نيزوكو وأبطال الفرقة.','Demon Slayer stickers — Tanjiro, Nezuko and the Hashira.',
 4500,'🌊','#1e88e5','stickers','bestseller', array['Anime','Demon Slayer'], false,false,28,4.9,118,19),
('chainsaw-pack','ستكرز تشين سو مان','Chainsaw Man Sticker Pack','12 ستكر','12 stickers',
 'ستكرات تشين سو مان بتصاميم جريئة مقاومة للماء.','Bold, waterproof Chainsaw Man stickers.',
 4000,'🔺','#e53935','stickers','waterproof', array['Anime','Chainsaw Man'], true,false,26,4.7,76,15),
('spyfamily-pack','ستكرز عائلة التجسس','Spy x Family Sticker Pack','12 ستكر','12 stickers',
 'ستكرات عائلة التجسس — آنيا ويورو وبوند.','Spy x Family stickers — Anya, Yor and Bond.',
 4000,'🥜','#43a047','stickers','new', array['Anime','Spy x Family'], false,false,24,4.8,64,18),
('valorant-pack','ستكرز فالورانت','Valorant Sticker Pack','10 ستكرات فينيل','10 vinyl stickers',
 'ستكرات فالورانت فينيل مقاومة للماء بشعارات الوكلاء.','Waterproof Valorant vinyl stickers with agent logos.',
 5000,'🎯','#ff4655','stickers','waterproof', array['Gaming','Valorant'], true,false,22,4.8,91,16),
('genshin-pack','ستكرز جينشن إمباكت','Genshin Impact Sticker Pack','14 ستكر','14 stickers',
 'ستكرات جينشن إمباكت بشخصيات تيفات المفضلة.','Genshin Impact stickers of your favorite Teyvat characters.',
 5000,'⭐','#4db6ac','stickers',null, array['Gaming','Genshin'], false,false,20,4.7,58,14),
('iraqi-sayings','ستكرز أقوال عراقية','Iraqi Sayings Stickers','ميمز محلية','Local memes',
 'أشهر الأقوال والميمز العراقية على ستكرات لاصقة.','The most iconic Iraqi sayings and memes as stickers.',
 4000,'🗣️','#f9a825','stickers','bestseller', array['Local','Memes'], false,false,40,5.0,187,20),
-- ---- Posters ----
('aot-poster','بوستر هجوم العمالقة A3','Attack on Titan Poster A3','طباعة A3 ماط','A3 matte print',
 'بوستر هجوم العمالقة بقياس A3 على ورق ماط فاخر.','A3 Attack on Titan poster on premium matte stock.',
 9000,'🗡️','#455a64','posters','bestseller', array['Anime','AOT'], false,false,18,4.8,73,17),
('solo-leveling-poster','بوستر سولو ليفلنغ','Solo Leveling Poster A3','إصدار محدود','Limited edition',
 'بوستر سولو ليفلنغ لسونغ جين وو — إصدار محدود.','Solo Leveling poster of Sung Jinwoo — limited edition.',
 9000,'🌑','#5e35b1','posters','new', array['Anime','Solo Leveling'], false,false,15,4.9,88,19),
('frieren-poster','بوستر فريرن','Frieren Poster A3','طباعة A3','A3 print',
 'بوستر فريرن الهادئ بألوان مائية أنيقة.','Serene Frieren poster with elegant watercolor tones.',
 8000,'✨','#26a69a','posters','new', array['Anime','Frieren'], false,false,17,4.8,45,18),
('gta-poster','بوستر جي تي أيه 6','GTA VI Poster','ورق لامع','Glossy paper',
 'بوستر جي تي أيه 6 بأجواء فايس سيتي.','GTA VI poster with Vice City vibes.',
 10000,'🌴','#ec407a','posters',null, array['Gaming','GTA'], false,false,16,4.6,52,14),
-- ---- Brooches ----
('gojo-brooch','بروش غوجو','Gojo Satoru Brooch','أكريليك لامع','Glossy acrylic',
 'بروش أكريليك لغوجو ساتورو مع دبوس معدني متين.','Glossy acrylic Gojo Satoru brooch with sturdy metal pin.',
 12000,'🔵','#5e35b1','brooches','bestseller', array['Anime','JJK'], false,false,19,4.9,64,17),
('nezuko-brooch','بروش نيزوكو','Nezuko Brooch','أكريليك','Acrylic',
 'بروش نيزوكو بتفاصيل دقيقة وألوان زاهية.','Nezuko brooch with fine detail and vivid colors.',
 11000,'🎋','#ef6c00','brooches','new', array['Anime','Demon Slayer'], false,false,21,4.7,38,16),
('valorant-brooch','بروش فالورانت','Valorant Brooch','معدني','Metal',
 'بروش معدني بشعار فالورانت بلمسة نهائية أنيقة.','Metal Valorant brooch with a sleek finish.',
 13000,'🎯','#ff4655','brooches',null, array['Gaming','Valorant'], false,false,14,4.6,29,13),
-- ---- 3D Medals ----
('luffy-3d','ميدالية لوفي 3D','Luffy 3D Medal','طباعة ثلاثية الأبعاد','3D printed',
 'ميدالية لوفي مطبوعة ثلاثية الأبعاد مع سلسلة معدنية.','3D-printed Luffy medal with a metal chain.',
 15000,'🏴‍☠️','#6d4c41','medals','bestseller', array['Anime','One Piece','3D Print'], false,false,16,4.8,71,18),
('sung-jinwoo-3d','ميدالية سونغ جين وو 3D','Sung Jinwoo 3D Medal','طباعة ثلاثية الأبعاد','3D printed',
 'ميدالية سونغ جين وو ثلاثية الأبعاد بتفاصيل الظل.','3D Sung Jinwoo medal with shadow-monarch detailing.',
 18000,'⚔️','#4527a0','medals','new', array['Anime','Solo Leveling','3D Print'], false,false,12,4.9,49,19),
('iraq-flag-3d','ميدالية علم العراق 3D','Iraq Flag 3D Medal','طباعة ثلاثية الأبعاد','3D printed',
 'ميدالية علم العراق ثلاثية الأبعاد صناعة محلية.','Locally made 3D Iraq flag medal.',
 12000,'🇮🇶','#2e7d32','medals',null, array['Local','3D Print'], false,false,30,4.9,96,17)
on conflict (id) do nothing;

-- Product ↔ fandom links
insert into public.product_fandoms (product_id, fandom_code) values
  ('aot-pack','anime'), ('demon-slayer-pack','anime'), ('chainsaw-pack','anime'),
  ('spyfamily-pack','anime'), ('valorant-pack','gaming'), ('genshin-pack','gaming'),
  ('iraqi-sayings','local'), ('iraqi-sayings','memes'),
  ('aot-poster','anime'), ('solo-leveling-poster','anime'), ('frieren-poster','anime'),
  ('gta-poster','gaming'),
  ('gojo-brooch','anime'), ('nezuko-brooch','anime'), ('valorant-brooch','gaming'),
  ('luffy-3d','anime'), ('sung-jinwoo-3d','anime'), ('iraq-flag-3d','local')
on conflict (product_id, fandom_code) do nothing;
