"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { ensureDeviceId } from "@/lib/device-id";
import { couponLimitBlock } from "@/lib/coupon-guard";

/**
 * Coupon validation for the cart preview. The preview_coupon RPC re-checks
 * everything the checkout does (window, min subtotal, usage + per-user limits,
 * user targeting) against the CURRENT user, so the cart can show a real number
 * before checkout. place_order() is still the authority on what's charged.
 *
 * The RPC's per-user check can only see `auth.uid()`, which is null for the
 * guests who make up most of this store's orders — so the usage ledger is
 * consulted on top of it, and that one knows the device too (lib/coupon-guard).
 */

export interface CouponPreview {
  valid: boolean;
  code?: string;
  discount?: number;
  type?: "percent" | "fixed";
  value?: number;
  /** the coupon only applies to specific products — the final total may differ */
  scoped?: boolean;
  /** why it was rejected: not_found | expired | min_subtotal | usage_limit | … */
  reason?: string;
  min?: number;
}

export async function previewCouponAction(
  code: string,
  subtotal: number,
): Promise<CouponPreview> {
  const trimmed = code.trim();
  if (!trimmed) return { valid: false, reason: "empty" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_coupon", {
    p_code: trimmed,
    p_subtotal: Math.max(0, Math.floor(subtotal)),
  });
  if (error) {
    console.error("[previewCoupon]", error);
    return { valid: false, reason: "error" };
  }

  const preview = data as unknown as CouponPreview;
  // Only a code the RPC already accepted can be worth a second look — a
  // rejection it made stands, with its own reason.
  if (!preview?.valid) return preview;

  // Mint the device marker here rather than at checkout, so the cart can say
  // "you have already used this" while the customer can still act on it.
  const [deviceId, user] = await Promise.all([ensureDeviceId(), getCurrentUser()]);
  const block = await couponLimitBlock(trimmed, {
    deviceId,
    userId: user?.id ?? null,
  });
  if (block === "per_user_limit") return { valid: false, reason: "device_used" };
  if (block) return { valid: false, reason: block };

  return preview;
}
