-- ============================================================================
--  NEW ORDER STATUS: 'preparing'  ·  قيد التجهيز
--  Sits between "accepted" and "shipped".
--  Run by hand in the Supabase SQL editor (DDL cannot go through the app).
-- ============================================================================
--
--  WHAT THIS DOES
--  Adds one value to the public.order_status enum. That is all it does.
--
--  WHAT IT DOES NOT DO — and this is deliberate:
--  It does not move a single existing order. Adding a value to an enum leaves
--  every row exactly as it is, so an order sitting in `accepted` stays
--  `accepted`, and anything already `shipped` or `delivered` stays there too.
--  The new step is something the admin moves an order INTO from now on, never
--  something applied retroactively. At the time of writing that is 1 review,
--  10 accepted, 41 shipped and 148 delivered orders, all untouched.
--
--  RUN THE TWO STEPS SEPARATELY — do not paste the whole file at once.
--  `ALTER TYPE ... ADD VALUE` cannot be used by any other statement in the same
--  transaction, and the Supabase SQL editor wraps one submission in a single
--  transaction. Step 1, then Step 2, as two separate runs.
--
-- ============================================================================
--  STEP 1  ·  add the value  (run this on its own, then stop)
-- ============================================================================

-- `BEFORE 'shipped'` sets the value's SORT position, not just its existence.
-- Nothing in the app orders by this enum today, but a comparison like
-- `status >= 'accepted'` would silently do the wrong thing if the new value had
-- been appended to the end, which is where Postgres puts it by default.
--
-- `IF NOT EXISTS` makes this safe to run twice.
ALTER TYPE public.order_status
  ADD VALUE IF NOT EXISTS 'preparing' BEFORE 'shipped';


-- ============================================================================
--  STEP 2  ·  teach the dashboard KPI about it  (run after Step 1 has finished)
-- ============================================================================
--
--  dashboard_stats() counts "active orders" with a HARDCODED list of statuses:
--
--      status in ('review','accepted','shipped')
--
--  which would quietly exclude every order in the new step — the KPI tile on
--  the overview page would under-report as soon as the admin starts using it.
--
--  This block does NOT rewrite the function from a copy in the repo. The copy
--  here may be older than what is actually deployed, and replacing a function
--  wholesale from a stale source is how a working dashboard gets broken. It
--  reads the LIVE definition, swaps only that one expression inside it, and
--  re-creates the function otherwise byte-for-byte. If the expression isn't
--  there — because the function was already changed, or never looked like this
--  — it does nothing at all and says so.
--
--  The replacement is `status <> 'delivered'`, which is exactly equivalent to
--  the old list today and stays correct for any status added later.

DO $$
DECLARE
  def       text;
  patched   text;
  variants  text[] := array[
    'status in (''review'',''accepted'',''shipped'')',
    'status in (''review'', ''accepted'', ''shipped'')',
    'status IN (''review'',''accepted'',''shipped'')',
    'status IN (''review'', ''accepted'', ''shipped'')'
  ];
  v         text;
  hit       boolean := false;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'dashboard_stats'
   LIMIT 1;

  IF def IS NULL THEN
    RAISE NOTICE 'dashboard_stats() not found — nothing to patch.';
    RETURN;
  END IF;

  patched := def;
  FOREACH v IN ARRAY variants LOOP
    IF position(v in patched) > 0 THEN
      patched := replace(patched, v, 'status <> ''delivered''');
      hit := true;
    END IF;
  END LOOP;

  IF NOT hit THEN
    RAISE NOTICE
      'dashboard_stats(): no hardcoded status list found. Nothing changed — check active_orders by hand if the KPI looks low.';
    RETURN;
  END IF;

  EXECUTE patched;
  RAISE NOTICE 'dashboard_stats(): active_orders now counts every status except delivered.';
END $$;


-- ============================================================================
--  VERIFY
-- ============================================================================
--  1. The value exists, and in the right place (expect review, accepted,
--     preparing, shipped, delivered — in that order):
--
--       select enumlabel
--         from pg_enum
--        where enumtypid = 'public.order_status'::regtype
--        order by enumsortorder;
--
--  2. Nothing moved. These counts must match what they were before the
--     migration, and preparing must be 0 until the admin uses it:
--
--       select status, count(*) from public.orders group by status order by 1;
--
--  3. The KPI counts the new step. After moving one order to preparing,
--     `active_orders` should go UP by one, not stay put:
--
--       select (public.dashboard_stats() -> 'active_orders') as active_orders;
--
--  4. Stock still behaves. An order in preparing is a committed order, so its
--     pieces stay off the shelf — this is already handled by the existing
--     `status <> 'review'` rule in the stock view, and needs no change:
--
--       select code, status, stock_applied
--         from public.orders
--        where status = 'preparing';
-- ============================================================================
