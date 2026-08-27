-- ============================================================================
--  ROFOOF — discount codes that actually stop at their limit
--
--  THE BUG THIS FIXES
--  A code could be set to "once per customer" and still be used over and over.
--  The limits were being READ at checkout but never WRITTEN: `coupon_redemptions`
--  was empty and `coupons.used_count` was 0 for every code in the store, while
--  twelve orders had already been placed with one. Every check compared a real
--  limit against zero, so every check passed.
--
--  The missing half now lives in lib/coupon-guard.ts: it writes a redemption
--  row when an order actually takes a discount, counts them before the next
--  order is allowed, and deletes the row when the order is cancelled.
--
--  WHAT THIS FILE ADDS
--  A guest never signs in, so `user_id` identifies nobody and a per-customer
--  cap has nothing to bind to. These two columns are what it binds to instead:
--
--    device_id       the browser the order came from (a cookie — see
--                     lib/device-id.ts). Catches the ordinary repeat use, and
--                     catches it in the CART, before the customer has typed
--                     anything.
--    customer_phone  the number on the order. The key that survives clearing
--                     cookies — the one that stops a deliberate second try.
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run the steps IN ORDER:
--
--    STEP 1   the two identity columns on coupon_redemptions
--    STEP 2   indexes for the three "have they used this already?" lookups
--    STEP 3   release the code when an order is deleted (safety net)
--    STEP 4   OPTIONAL, ONE-TIME: count the uses that already happened
--
--  It is safe to run this file more than once — every statement does nothing
--  if it has already been applied.
--
--  Nothing here can break the live site. Until you run it, the app falls back
--  to the account-only ledger it has always had: a signed-in customer is held
--  to their limit, a guest is not. Running it turns the device and phone keys
--  on. The app never assumes it has been run.
-- ============================================================================



-- ============================================================================
--  STEP 1 — Who the redemption belonged to
-- ============================================================================
--  Both are nullable and both are plain text. A row may legitimately carry
--  neither: an order placed before this file was run has no device id, and an
--  admin-placed order may have no usable number. A row like that still counts
--  towards the code's TOTAL limit, it just can't be traced to one customer.

ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS device_id text;

ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS customer_phone text;

COMMENT ON COLUMN public.coupon_redemptions.device_id IS
  'Anonymous per-browser marker (cookie rofoof_did). Holds a guest to a per-customer coupon limit.';
COMMENT ON COLUMN public.coupon_redemptions.customer_phone IS
  'Iraqi local form 07XXXXXXXXX. The identity key that survives a cookie clear.';



-- ============================================================================
--  STEP 2 — Indexes for the lookup the cart does on every keystroke of "Apply"
-- ============================================================================
--  Three separate indexes rather than one composite, because the check is an
--  OR across the three keys — Postgres can bitmap-or three small indexes, but
--  it cannot use a composite one for a query that names only its second column.
--
--  Deliberately NOT unique. A code may be set to allow two or three uses per
--  customer, and a unique index would silently cap every one of them at one.

CREATE INDEX IF NOT EXISTS coupon_redemptions_code_device_idx
  ON public.coupon_redemptions (coupon_code, device_id)
  WHERE device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS coupon_redemptions_code_phone_idx
  ON public.coupon_redemptions (coupon_code, customer_phone)
  WHERE customer_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS coupon_redemptions_code_user_idx
  ON public.coupon_redemptions (coupon_code, user_id)
  WHERE user_id IS NOT NULL;

-- The release path (and the used_count resync) look a row up by its order.
CREATE INDEX IF NOT EXISTS coupon_redemptions_order_idx
  ON public.coupon_redemptions (order_code);



-- ============================================================================
--  STEP 3 — A cancelled order gives its code back
-- ============================================================================
--  WHY
--  Cancelling an order DELETES it (an AFTER DELETE trigger archives it into
--  cancelled_orders). If the redemption row outlived the order, a customer
--  whose order the store cancelled would be left holding a one-time code they
--  could never use again — punished for a cancellation that wasn't theirs.
--
--  The app already releases the code on all three cancel paths (customer,
--  guest, admin). This trigger is the safety net underneath them: it also
--  fires for an order deleted straight from the Supabase table editor, or by
--  any future code path that forgets to call the release itself.
--
--  used_count is RECOMPUTED from the ledger rather than decremented, so it
--  cannot drift — the same reason lib/coupon-guard.ts recomputes it too.

CREATE OR REPLACE FUNCTION public.release_coupon_on_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.coupon_code IS NULL THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.coupon_redemptions WHERE order_code = OLD.code;

  UPDATE public.coupons c
     SET used_count = (
           SELECT count(*) FROM public.coupon_redemptions r
            WHERE r.coupon_code = c.code
         )
   WHERE c.code = upper(OLD.coupon_code);

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_coupon_on_order_delete ON public.orders;
CREATE TRIGGER trg_release_coupon_on_order_delete
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.release_coupon_on_order_delete();



-- ============================================================================
--  STEP 4 — OPTIONAL, ONE-TIME: count the uses that already happened
-- ============================================================================
--  READ THIS BEFORE RUNNING IT.
--
--  Everything above only governs orders placed from now on. The ledger starts
--  empty, so a customer who already used a one-time code five times before the
--  fix still has a clean slate and can use it once more.
--
--  This step writes those past uses into the ledger, from the orders that
--  recorded them. After it, a code that says "once per customer" is honoured
--  against the whole history of the store — which is almost certainly what was
--  meant when the limit was set, but it WILL refuse customers who were being
--  let through yesterday. If you would rather draw a line under it and start
--  clean, simply skip this step; nothing else depends on it.
--
--  Past orders carry no device id (there wasn't one), so they are matched on
--  the account and the phone number only. It is safe to re-run: an order
--  already in the ledger is skipped.

INSERT INTO public.coupon_redemptions (coupon_code, user_id, order_code, customer_phone)
SELECT
  upper(o.coupon_code),
  o.user_id,
  o.code,
  nullif(regexp_replace(o.customer_phone, '\D', '', 'g'), '')
FROM public.orders o
WHERE o.coupon_code IS NOT NULL
  -- Only an order that actually took money off. place_order() applies the best
  -- single discount, so a cart offer may have beaten the coupon and left it
  -- unspent; that customer never got the discount and still has their use.
  AND o.discount_total > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.coupon_redemptions r WHERE r.order_code = o.code
  );

-- Bring every code's displayed counter in line with the ledger it now has.
UPDATE public.coupons c
   SET used_count = (
         SELECT count(*) FROM public.coupon_redemptions r
          WHERE r.coupon_code = c.code
       );



-- ============================================================================
--  AFTERWARDS — how to check it worked
-- ============================================================================
--  Place a test order with a one-per-customer code, then:
--
--    SELECT coupon_code, user_id, device_id, customer_phone, order_code
--      FROM coupon_redemptions ORDER BY created_at DESC LIMIT 5;
--
--  A row should be there, with a device_id. Applying the same code in the same
--  browser now answers "already used on this device" in the cart, in Arabic or
--  English. Cancel that order and the row disappears — the code works again.
-- ============================================================================
