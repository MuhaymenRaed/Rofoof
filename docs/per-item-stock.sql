-- ============================================================================
--  ROFOOF — database changes for per-design stock + the delivery banner
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run STEP 1, then STEP 2, then STEP 3.
--  Run them one at a time and read the note above each one first.
--
--  It is safe to run this file more than once. Every statement is written to
--  do nothing if it has already been applied.
--
--  STEP 4 is optional (a health check you can run any time).
--  STEP 5 is NOT ready to run — it needs something from you first.
--
--  Nothing here can break the live site. The website already copes with these
--  columns being missing: until you run this, stock is simply "not tracked"
--  and every design stays buyable, exactly as it behaves today.
-- ============================================================================



-- ============================================================================
--  STEP 1 — Add the stock column to package designs
-- ============================================================================
--  WHAT THIS DOES
--  Adds a `stock` number to each design inside a package, so the Kirby sheet
--  and the Stitch sheet can be counted separately instead of sharing one
--  number on the package.
--
--  WHY IT STARTS AT 0
--  New columns need a starting value. 0 (sold out) is the safe direction —
--  nothing can be oversold in the gap before you set the real numbers.
--  STEP 2 immediately sets them all to 5, so nothing stays sold out.
-- ----------------------------------------------------------------------------

alter table public.product_items
  add column if not exists stock integer not null default 0;

-- Stops a negative count ever being written, whatever writes it.
do $$
begin
  alter table public.product_items
    add constraint product_items_stock_non_negative check (stock >= 0);
exception
  when duplicate_object then null;  -- already added on an earlier run
end $$;



-- ============================================================================
--  STEP 2 — Put every product in the shop at 5 in stock
-- ============================================================================
--  WHAT THIS DOES
--  Sets the count to 5 for BOTH kinds of product:
--    - every design inside every package  (product_items)
--    - every one-photo product            (products)
--
--  This is a starting point, not a permanent setting. From now on you change
--  these numbers in the dashboard: open a product, and each design has a stock
--  box under its price, with a "one stock count for all images" box that fills
--  them all at once.
--
--  RE-RUNNING THIS RESETS EVERYTHING BACK TO 5. Run it once now; after that,
--  use the dashboard instead, or you will wipe out counts you have edited.
-- ----------------------------------------------------------------------------

update public.product_items
   set stock = 5
 where is_deleted = false;

update public.products
   set stock = 5
 where is_deleted = false;



-- ============================================================================
--  STEP 3 — Add the on/off switch for the home-page delivery bar
-- ============================================================================
--  WHAT THIS DOES
--  Backs the "Show the delivery bar on the home page" checkbox, which is in
--  the dashboard next to the delivery fees. Until you run this, the bar always
--  shows and that checkbox quietly does nothing (ticking it won't error, and
--  it won't stop the fees next to it from saving).
-- ----------------------------------------------------------------------------

alter table public.settings
  add column if not exists delivery_notice_active boolean not null default true;


--  ---------------------------------------------------------------------------
--  IMPORTANT — what number the bar shows
--
--  The bar shows `delivery_fee_default`, which is the fee EVERY province pays
--  except Karbala. Karbala has its own cheaper fee, and the bar deliberately
--  does not quote that one: advertising 3,000 while most of the country is
--  charged 5,000 would be found out at checkout.
--
--  Right now those two are different (5,000 and 3,000), so the bar will read
--  5,000. You said you want one flat 3,000 for the whole country — that means
--  setting BOTH to 3,000. Uncomment and run this, or do the same thing in the
--  dashboard under the delivery fees, which is easier:
--  ---------------------------------------------------------------------------

-- update public.settings
--    set delivery_fee_default = 3000,
--        delivery_fee_karbala = 3000
--  where id = true;



-- ============================================================================
--  STEP 4 — (optional) Health check
-- ============================================================================
--  Run this any time to see the stock numbers the shop is working from.
--  `designs_in_stock = 0` on a package means that package now reads as sold
--  out on the site.
-- ----------------------------------------------------------------------------

select p.id,
       p.name_ar,
       p.kind,
       count(i.id)                            as designs,
       count(i.id) filter (where i.stock > 0) as designs_in_stock,
       sum(i.stock)                           as total_pieces,
       p.stock                                as one_photo_stock
  from public.products p
  left join public.product_items i
    on i.product_id = p.id
   and i.is_deleted = false
 where p.is_deleted = false
 group by p.id, p.name_ar, p.kind, p.stock
 order by designs_in_stock asc, p.name_ar;


--  And the delivery check you asked me to confirm: on every row `maths_ok`
--  must be true, which means the delivery fee was added on top at full price
--  no matter how large the discount was.

select code,
       subtotal,
       discount_total,
       delivery_fee,
       total,
       total = greatest(subtotal - discount_total, 0) + delivery_fee as maths_ok
  from public.orders
 order by created_at desc
 limit 50;



-- ============================================================================
--  STEP 5 — DO NOT RUN YET — stop the shop overselling
-- ============================================================================
--  THIS IS THE ONE THING STILL MISSING, and it is the important one.
--
--  The website greys out a sold-out design and stops the + button going past
--  what is left. But that is only the shopper's screen. Two people can be
--  holding the last piece at the same moment, and neither screen knows about
--  the other. Only place_order() — the function that actually takes the order
--  — can settle that, and it does not check stock yet.
--
--  So today: stock numbers display correctly and update correctly, but nothing
--  yet stops a design being ordered past 0 if two people buy at once.
--
--  I have NOT written it here on purpose. Doing that means editing your live
--  place_order() function, and my last attempt at guessing a function body is
--  what gave you the "cannot change return type" error. I am not repeating
--  that on the function that takes your customers' money.
--
--  WHAT I NEED FROM YOU — run this one line and send me what it prints:
-- ----------------------------------------------------------------------------

select pg_get_functiondef('public.place_order'::regproc);

--  Then I will write the stock check into your actual function, and give you
--  a single statement to run that replaces it safely.
-- ============================================================================
