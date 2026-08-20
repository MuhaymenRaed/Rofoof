-- ============================================================================
--  ROFOOF — split the store's category filter into two boxes
--
--  WHAT THIS IS FOR
--  The store page now shows the categories in TWO boxes instead of one row:
--
--    box 1 (red)   نوع المنتج   — ستكرات، بوسترات، بروشات، ميداليات، ميداليات الاقراص
--    box 2 (blue)  الاهتمام     — العاب، انمي، كرة قدم، بناتي، سوبر هيروز، …
--
--  Choices inside one box are OR-ed, and the two boxes are AND-ed together:
--  "ستكرات" + "العاب" now means GAME STICKERS, not "stickers or games". A box
--  left empty means "all of it", so picking only "العاب" still returns every
--  sticker, poster, brooch and medal about games.
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run the steps IN ORDER, one at a time.
--  It is safe to run more than once — every statement does nothing if it has
--  already been applied.
--
--    STEP 1  add the column that says which box a category belongs to
--    STEP 2  put the five product types in the first box
--    STEP 3  optional check — see where every category ended up
--
--  NOTHING HERE CAN BREAK THE LIVE SITE. The website already copes with the
--  column being missing: until you run this, it sorts the chips into the two
--  boxes by their code instead (the five codes listed in STEP 2 go in box 1,
--  everything else in box 2). Running it hands that decision to you, and is
--  what lets you MOVE a category between the boxes from
--  «إدارة الفلاتر» on the store page — before it is run, that button will
--  appear to do nothing.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  STEP 1 — the column
--
--  Defaults to 'theme' (box 2), which is the right home for anything new an
--  admin adds: new categories are almost always subjects (a new game, a new
--  show), while the product types the shop makes change very rarely.
-- ----------------------------------------------------------------------------
alter table public.categories
  add column if not exists category_group text not null default 'theme';

-- Only the two values mean anything; anything else would land the chip in a
-- box that isn't drawn. Dropped first so re-running the file can't fail on a
-- constraint that is already there.
alter table public.categories
  drop constraint if exists categories_category_group_check;

alter table public.categories
  add constraint categories_category_group_check
  check (category_group in ('type', 'theme'));


-- ----------------------------------------------------------------------------
--  STEP 2 — the five product types go in box 1
--
--  Everything else stays 'theme' from the default in step 1. If you later add
--  a new product FORM (say enamel pins), either add its code here or move it
--  across from «إدارة الفلاتر» on the store page — tapping a category there
--  sends it to the other box.
-- ----------------------------------------------------------------------------
update public.categories
   set category_group = 'type'
 where code in ('stickers', 'posters', 'brooches', 'medals', 'ps-keychains');


-- ----------------------------------------------------------------------------
--  STEP 3 — optional check
--
--  Run this any time to see the filter exactly as a shopper will: box 1 first,
--  then box 2, each in the order the chips appear.
-- ----------------------------------------------------------------------------
select
  case category_group when 'type' then 'box 1 — نوع المنتج' else 'box 2 — الاهتمام' end as box,
  code,
  name_ar,
  sort_order
from public.categories
where coalesce(is_deleted, false) = false
order by (category_group <> 'type'), sort_order;
