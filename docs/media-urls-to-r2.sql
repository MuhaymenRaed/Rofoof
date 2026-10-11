-- ============================================================================
--  POINT EVERY STORED MEDIA URL AT CLOUDFLARE R2
--  Run this by hand in the Supabase SQL editor, AFTER the file copy verifies.
-- ============================================================================
--
--  WHY
--  Supabase Storage's free tier is 1 GB and this shop went past it — 23,437
--  objects, 1.50 GB. The files moved to Cloudflare R2 (10 GB free), served
--  from https://media.rofoof.net. Only the FILES moved; the database stayed.
--  This is the one statement set that repoints the rows at them.
--
--  WHAT MAKES IT A PURE PREFIX SWAP
--  The copy preserved every path byte-for-byte, with the old bucket name kept
--  as the first key segment:
--
--    before  https://kzcs….supabase.co/storage/v1/object/public/product-images/mug/171…-w800.webp
--    after   https://media.rofoof.net/product-images/mug/171…-w800.webp
--
--  That is not cosmetic. `lib/media.ts` promises that a `-w<n>.webp` URL has
--  smaller siblings at the same path, and `lib/image-loader.ts` rewrites URLs
--  on that promise WITHOUT checking the target exists. Reshaping paths would
--  point live traffic at 404s, so the only thing that changes is the host.
--
--  ORDER — DO NOT RUN THIS FIRST
--  1. Copy the files           scripts/migrate-storage-to-r2.mjs
--  2. Verify the copy          scripts/migrate-storage-to-r2.mjs --verify
--  3. THIS FILE
--  Running it before the files are in R2 points the whole catalogue at 404s.
--
--  REVERSIBLE
--  Supabase Storage is NOT deleted by any of this. The rollback is the same
--  statements with the two prefixes swapped — see ROLLBACK at the bottom.
--  Keep the Supabase bucket until you are satisfied; deleting it is what makes
--  this one-way, and nothing here does that.
--
--  SAFE TO RE-RUN
--  Every statement is guarded by `like 'https://kzcs…%'`, so a row already
--  rewritten is not matched a second time.
-- ============================================================================

begin;

-- Scalar columns ------------------------------------------------------------

update public.products
   set image_url = replace(image_url,
         'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
         'https://media.rofoof.net/')
 where image_url like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%';

update public.product_items
   set image_url = replace(image_url,
         'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
         'https://media.rofoof.net/')
 where image_url like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%';

update public.order_items
   set custom_image_url = replace(custom_image_url,
         'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
         'https://media.rofoof.net/')
 where custom_image_url like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%';

update public.cancelled_order_items
   set custom_image_url = replace(custom_image_url,
         'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
         'https://media.rofoof.net/')
 where custom_image_url like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%';

-- Array columns -------------------------------------------------------------
-- `replace` over each element, rebuilt in order. `with ordinality` is what
-- keeps the order: products.images is index-aligned with products.print_images
-- (see Product.printImages), so a reshuffle here would silently pair every
-- photo with the wrong print master.

update public.products p
   set images = a.rebuilt
  from (
    select p2.id, array_agg(
             replace(u, 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
                        'https://media.rofoof.net/')
             order by ord) as rebuilt
      from public.products p2, unnest(p2.images) with ordinality as t(u, ord)
     group by p2.id
  ) a
 where a.id = p.id
   and exists (select 1 from unnest(p.images) u
                where u like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%');

update public.products p
   set print_images = a.rebuilt
  from (
    select p2.id, array_agg(
             replace(u, 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
                        'https://media.rofoof.net/')
             order by ord) as rebuilt
      from public.products p2, unnest(p2.print_images) with ordinality as t(u, ord)
     group by p2.id
  ) a
 where a.id = p.id
   and exists (select 1 from unnest(p.print_images) u
                where u like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%');

update public.orders o
   set custom_images = a.rebuilt
  from (
    select o2.id, array_agg(
             replace(u, 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
                        'https://media.rofoof.net/')
             order by ord) as rebuilt
      from public.orders o2, unnest(o2.custom_images) with ordinality as t(u, ord)
     group by o2.id
  ) a
 where a.id = o.id
   and exists (select 1 from unnest(o.custom_images) u
                where u like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%');

update public.order_items i
   set custom_images = a.rebuilt
  from (
    select i2.id, array_agg(
             replace(u, 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
                        'https://media.rofoof.net/')
             order by ord) as rebuilt
      from public.order_items i2, unnest(i2.custom_images) with ordinality as t(u, ord)
     group by i2.id
  ) a
 where a.id = i.id
   and exists (select 1 from unnest(i.custom_images) u
                where u like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%');

update public.cancelled_orders o
   set custom_images = a.rebuilt
  from (
    select o2.id, array_agg(
             replace(u, 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/',
                        'https://media.rofoof.net/')
             order by ord) as rebuilt
      from public.cancelled_orders o2, unnest(o2.custom_images) with ordinality as t(u, ord)
     group by o2.id
  ) a
 where a.id = o.id
   and exists (select 1 from unnest(o.custom_images) u
                where u like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/%');

commit;

-- ============================================================================
--  VERIFY — all six must read 0
-- ============================================================================
--    select 'products.image_url' c, count(*) n from products
--      where image_url like 'https://kzcs%storage/v1/object/public/%'
--    union all select 'products.images', count(*) from products
--      where exists (select 1 from unnest(images) u where u like 'https://kzcs%storage/v1/object/public/%')
--    union all select 'product_items.image_url', count(*) from product_items
--      where image_url like 'https://kzcs%storage/v1/object/public/%'
--    union all select 'orders.custom_images', count(*) from orders
--      where exists (select 1 from unnest(custom_images) u where u like 'https://kzcs%storage/v1/object/public/%')
--    union all select 'order_items.custom_images', count(*) from order_items
--      where exists (select 1 from unnest(custom_images) u where u like 'https://kzcs%storage/v1/object/public/%')
--    union all select 'order_items.custom_image_url', count(*) from order_items
--      where custom_image_url like 'https://kzcs%storage/v1/object/public/%';
--
--  And spot-check that a rewritten URL actually serves:
--    select image_url from products where image_url like 'https://media.rofoof.net/%' limit 1;
--  then open it, or:  curl -I "<that url>"   → 200, content-type image/webp
--
-- ============================================================================
--  ROLLBACK — the same swap, reversed
-- ============================================================================
--  Only valid while the Supabase bucket still holds the files (this migration
--  never deletes them). Repeat each statement above with the two prefixes
--  exchanged, e.g.:
--
--    update public.products
--       set image_url = replace(image_url, 'https://media.rofoof.net/',
--             'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/')
--     where image_url like 'https://media.rofoof.net/%';
-- ============================================================================
