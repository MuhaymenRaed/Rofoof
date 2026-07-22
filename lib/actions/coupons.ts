"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Coupon validation for the cart preview. The preview_coupon RPC re-checks
 * everything the checkout does (window, min subtotal, usage + per-user limits,
 * user targeting) against the CURRENT user, so the cart can show a real number
 * before checkout. place_order() is still the authority on what's charged.
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
  return data as unknown as CouponPreview;
}
