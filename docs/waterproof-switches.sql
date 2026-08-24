-- ============================================================================
--  ROFOOF — master switches for the waterproof add-on
--
--  WHAT THIS DOES
--  Adds two on/off switches to the shop's settings, shown at the top of the
--  dashboard's "إدارة المخزون" (Inventory) page:
--
--    waterproof_products_active   the waterproof option on CATALOGUE products
--    waterproof_custom_active     the waterproof option on CUSTOM requests
--
--  They are separate on purpose: running out of the laminate for sheets
--  shouldn't stop you offering it on a commission, or the other way round.
--
--  WHY IT HIDES THE OPTION RATHER THAN ZEROING ITS PRICE
--  A switched-off add-on is one the shop cannot currently do — not a free one.
--  Each product keeps its own `waterproof` flag and its own surcharge exactly
--  as set in the product editor; these switches sit ON TOP of that, so turning
--  one back on restores every product's own setting untouched.
--
--  BOTH DEFAULT TO TRUE, and the website treats the columns as true whenever
--  they are missing — so until you run this, the shop offers waterproof exactly
--  as it does today and the two switches simply report that they need this
--  migration. Safe to run more than once.
-- ============================================================================

alter table public.settings
  add column if not exists waterproof_products_active boolean not null default true,
  add column if not exists waterproof_custom_active   boolean not null default true;
