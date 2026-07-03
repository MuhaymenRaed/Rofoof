-- =============================================================================
-- rofoof — fix empty lookups (FK errors) + multiple product images + admin CRUD.
-- Idempotent. Run once in the Supabase SQL editor.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEED LOOKUPS  (fixes: products_category_code_fkey / provinces / fandoms)
--    The FK error "Key is not present in table categories" means these were
--    never seeded. This block populates them.
-- ----------------------------------------------------------------------------
insert into public.categories (code, name_ar, name_en, icon, sort_order) values
  ('stickers','ستكرات','Stickers','sticker',1),
  ('posters','بوسترات','Posters','photo',2),
  ('brooches','بروشات','Brooches','hexagon',3),
  ('medals','ميداليات 3D','3D Medals','cube',4)
on conflict (code) do nothing;

insert into public.fandoms (code, name_ar, name_en, sort_order) values
  ('gaming','قيمنق','Gaming',1),('anime','أنمي','Anime',2),
  ('memes','ميمز','Memes',3),('local','محلي','Local',4)
on conflict (code) do nothing;

insert into public.provinces (code, name_ar, name_en, sort_order) values
  ('baghdad','بغداد','Baghdad',1),('basra','البصرة','Basra',2),('nineveh','نينوى','Nineveh',3),
  ('erbil','أربيل','Erbil',4),('najaf','النجف','Najaf',5),('karbala','كربلاء','Karbala',6),
  ('kirkuk','كركوك','Kirkuk',7),('anbar','الأنبار','Anbar',8),('diyala','ديالى','Diyala',9),
  ('dhiqar','ذي قار','Dhi Qar',10),('babil','بابل','Babil',11),('wasit','واسط','Wasit',12),
  ('maysan','ميسان','Maysan',13),('muthanna','المثنى','Muthanna',14),('qadisiyah','القادسية','Qadisiyah',15),
  ('saladin','صلاح الدين','Saladin',16),('sulaymaniyah','السليمانية','Sulaymaniyah',17),('duhok','دهوك','Duhok',18)
on conflict (code) do nothing;

insert into public.coupons (code, discount_type, value, min_subtotal, active) values
  ('ROFOOF10','percent',10,0,true)
on conflict (code) do nothing;

insert into public.settings (id, announcement_ar, announcement_en, promo_code) values
  (true, 'كود خصم ROFOOF10 — بوسترات ميكو × تيتو متوفرة الآن',
   'Use code ROFOOF10 — Miku × Teto posters available now', 'ROFOOF10')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 2. MULTIPLE IMAGES:  products.images text[]  (image_url stays as the cover)
-- ----------------------------------------------------------------------------
alter table public.products add column if not exists images text[] not null default '{}';

-- Backfill the array from the existing single image_url
update public.products
   set images = array[image_url]
 where image_url is not null and (array_length(images, 1) is null);

-- Keep image_url in sync as the cover (= first image). Legacy consumers still work.
create or replace function public.sync_product_cover()
returns trigger language plpgsql as $$
begin
  if array_length(new.images, 1) is not null then
    new.image_url := new.images[1];
  else
    new.image_url := null;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_cover on public.products;
create trigger trg_sync_cover
  before insert or update of images on public.products
  for each row execute function public.sync_product_cover();

-- ----------------------------------------------------------------------------
-- 3. ADMIN IMAGE CRUD (array management; file CRUD is via Storage below)
-- ----------------------------------------------------------------------------
create or replace function public.admin_add_product_image(p_id text, p_url text)
returns text[] language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products
     set images = case when p_url = any(coalesce(images, '{}'))
                       then images else array_append(coalesce(images, '{}'), p_url) end
   where id = p_id
   returning images into v;
  return v;
end; $$;

create or replace function public.admin_remove_product_image(p_id text, p_url text)
returns text[] language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set images = array_remove(coalesce(images, '{}'), p_url)
   where id = p_id returning images into v;
  return v;
end; $$;

-- Replace / reorder the whole list at once
create or replace function public.admin_set_product_images(p_id text, p_urls text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.products set images = coalesce(p_urls, '{}')
   where id = p_id returning images into v;
  return v;
end; $$;

grant execute on function public.admin_add_product_image(text, text)   to authenticated;
grant execute on function public.admin_remove_product_image(text, text) to authenticated;
grant execute on function public.admin_set_product_images(text, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. STORAGE BUCKET — public read, full admin CRUD (upload/replace/delete).
--    Images live under product-images/<product_id>/<file>. One bucket holds
--    unlimited objects, so multiple images per product need no schema change.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images','product-images', true, 5242880,
  array['image/png','image/jpeg','image/webp','image/avif','image/gif','image/svg+xml'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product-images public read"  on storage.objects;
drop policy if exists "product-images admin insert" on storage.objects;
drop policy if exists "product-images admin update" on storage.objects;
drop policy if exists "product-images admin delete" on storage.objects;

create policy "product-images public read" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "product-images admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

-- =============================================================================
-- Done. Product creation now works (lookups seeded), products carry an image
-- list, and admins have full image CRUD (Storage objects + the images[] array).
-- =============================================================================
