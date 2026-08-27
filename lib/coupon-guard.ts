import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizePhoneInput } from "@/lib/contact";

/**
 * The coupon usage ledger — the thing that makes a limit a limit.
 *
 * `coupons.usage_limit` / `per_user_limit` were being read at checkout but
 * NOTHING was ever written back: `coupon_redemptions` stayed empty and
 * `used_count` stayed 0 for every code, so every check compared a real limit
 * against zero and passed. A one-per-customer code worked forever.
 *
 * This module is the missing half. It writes a redemption row when an order
 * actually takes a discount, counts them before the next one is allowed, and
 * REMOVES the row when the order is cancelled — a code spent on an order that
 * no longer exists has to come back to the customer.
 *
 * WHO IS "THE SAME CUSTOMER"
 * Three keys, any one of which is a match, because most shoppers here never
 * sign in and a per-user cap on `auth.uid()` alone would bind to nobody:
 *
 *   user_id         the account, when there is one
 *   device_id       this browser (see lib/device-id.ts) — how a guest is held
 *   customer_phone  the number on the order; known at checkout, not in the cart
 *
 * The phone is the one that survives clearing cookies, so it is what actually
 * stops a determined second use; the device id is what catches the ordinary
 * case, and does so in the cart, before the customer has typed anything.
 *
 * MIGRATION ORDER
 * `device_id` and `customer_phone` are added by docs/coupon-device-limits.sql.
 * Until it runs, every query here falls back to the account-only ledger rather
 * than failing — the app never depends on a migration having landed first.
 */

/** Which cap was hit. Null means "nothing stops this code being used now". */
export type CouponBlock = "usage_limit" | "per_user_limit" | null;

export interface CouponIdentity {
  /** This browser. Null only if the cookie could not be read at all. */
  deviceId: string | null;
  /** The signed-in account, when there is one. */
  userId: string | null;
  /** The number on the order. Unknown while the cart is still open. */
  phone?: string | null;
}

/** Codes are stored upper-case (see createCouponAction) — match that. */
function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** PostgREST's "column does not exist" — i.e. the migration hasn't run yet. */
function isMissingColumn(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    /device_id|customer_phone/i.test(error.message ?? "")
  );
}

/**
 * The `or=` filter naming this customer. Values are spliced into PostgREST's
 * filter grammar, so each is shape-checked first: a uuid, a validated device id
 * and a digits-only Iraqi number can none of them carry a comma or a paren.
 */
function identityFilters(
  identity: CouponIdentity,
  withNewColumns: boolean,
): string[] {
  const filters: string[] = [];
  if (identity.userId && /^[0-9a-fA-F-]{36}$/.test(identity.userId)) {
    filters.push(`user_id.eq.${identity.userId}`);
  }
  if (!withNewColumns) return filters;

  if (identity.deviceId && /^[A-Za-z0-9_-]{8,64}$/.test(identity.deviceId)) {
    filters.push(`device_id.eq.${identity.deviceId}`);
  }
  const phone = identity.phone ? sanitizePhoneInput(identity.phone) : "";
  if (/^07\d{9}$/.test(phone)) filters.push(`customer_phone.eq.${phone}`);
  return filters;
}

type Admin = ReturnType<typeof createAdminClient>;

/** How many times this code has been redeemed, in total or by one customer. */
async function countRedemptions(
  admin: Admin,
  code: string,
  identity: CouponIdentity | null,
): Promise<number> {
  const run = async (withNewColumns: boolean) => {
    let query = admin
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_code", code);

    if (identity) {
      const filters = identityFilters(identity, withNewColumns);
      // Nothing identifies this customer — no ledger row can belong to them.
      if (filters.length === 0) return { count: 0, error: null };
      query = query.or(filters.join(","));
    }
    const { count, error } = await query;
    return { count: count ?? 0, error };
  };

  let { count, error } = await run(true);
  // Pre-migration: retry against the columns that have always existed.
  if (error && isMissingColumn(error)) ({ count, error } = await run(false));
  if (error) {
    console.error("[couponGuard] count", error);
    // Never invent a block from a failed read — a database hiccup must not
    // refuse a discount the customer is entitled to.
    return 0;
  }
  return count;
}

/**
 * Is this code out of reach for this customer right now?
 *
 * Answers only the two questions the ledger owns. Everything else about a
 * coupon — does it exist, is it active, is the window open, is the subtotal
 * high enough, is this customer targeted — stays with preview_coupon().
 */
export async function couponLimitBlock(
  code: string,
  identity: CouponIdentity,
): Promise<CouponBlock> {
  const normalized = normalizeCode(code);
  if (!normalized) return null;

  try {
    const admin = createAdminClient();
    const { data: coupon, error } = await admin
      .from("coupons")
      .select("code, usage_limit, per_user_limit")
      .eq("code", normalized)
      .maybeSingle<{
        usage_limit: number | null;
        per_user_limit: number | null;
      }>();

    // Unknown code, or an uncapped one: nothing here to enforce.
    if (error || !coupon) return null;
    if (coupon.usage_limit == null && coupon.per_user_limit == null)
      return null;

    if (coupon.per_user_limit != null) {
      const mine = await countRedemptions(admin, normalized, identity);
      if (mine >= coupon.per_user_limit) return "per_user_limit";
    }
    if (coupon.usage_limit != null) {
      const all = await countRedemptions(admin, normalized, null);
      if (all >= coupon.usage_limit) return "usage_limit";
    }
    return null;
  } catch (e) {
    console.error("[couponGuard] block", e);
    return null;
  }
}

/**
 * `coupons.used_count` is what the dashboard shows and what preview_coupon()
 * reads. Recomputed from the ledger rather than incremented, so it is
 * self-correcting: a double call, or a release, leaves it right either way.
 */
async function syncUsedCount(admin: Admin, code: string): Promise<void> {
  const { count, error } = await admin
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_code", code);
  if (error || count == null) return;
  await admin.from("coupons").update({ used_count: count }).eq("code", code);
}

/**
 * Spend one use of the code on an order. Called only once the order exists AND
 * the database actually recorded the discount against it — a code that gave
 * nothing must never be burnt.
 */
export async function recordCouponRedemption(
  code: string,
  identity: CouponIdentity,
  orderCode: string,
): Promise<void> {
  const normalized = normalizeCode(code);
  if (!normalized) return;

  try {
    const admin = createAdminClient();
    const phone = identity.phone ? sanitizePhoneInput(identity.phone) : "";
    const base = {
      coupon_code: normalized,
      user_id: identity.userId,
      order_code: orderCode,
    };
    const { error } = await admin.from("coupon_redemptions").insert({
      ...base,
      device_id: identity.deviceId,
      customer_phone: /^07\d{9}$/.test(phone) ? phone : null,
    });
    // Pre-migration: record what CAN be recorded rather than losing the use
    // entirely. The account-level cap still holds; the device one starts
    // holding the moment the columns exist.
    if (error && isMissingColumn(error)) {
      const { error: fallbackError } = await admin
        .from("coupon_redemptions")
        .insert(base);
      if (fallbackError) {
        console.error("[couponGuard] record", fallbackError);
        return;
      }
    } else if (error && error.code !== "23505") {
      console.error("[couponGuard] record", error);
      return;
    }

    await syncUsedCount(admin, normalized);
  } catch (e) {
    console.error("[couponGuard] record", e);
  }
}

/**
 * Give the code back. A cancelled order is deleted outright (archived into
 * cancelled_orders by trigger), so the use it spent has to be handed back too —
 * otherwise a customer whose order the store cancelled is left holding a
 * one-time code they can never use.
 *
 * Keyed on the order code, so it is idempotent and safe to call for an order
 * that never had a coupon on it.
 */
export async function releaseCouponRedemption(
  orderCode: string,
): Promise<void> {
  const trimmed = orderCode.trim();
  if (!trimmed) return;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("coupon_redemptions")
      .delete()
      // A guest cancels by typing their order code, which may not come back in
      // the case it was stored in. Matched as an exact set rather than with
      // `ilike`, so a value carrying `%` can never widen into "every row".
      .in("order_code", Array.from(new Set([trimmed, trimmed.toUpperCase()])))
      .select("coupon_code");
    if (error) {
      console.error("[couponGuard] release", error);
      return;
    }
    const codes = new Set((data ?? []).map((r) => r.coupon_code));
    for (const code of codes) await syncUsedCount(admin, code);
  } catch (e) {
    console.error("[couponGuard] release", e);
  }
}
