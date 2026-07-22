"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { TAGS } from "@/lib/data/tags";
import type { OfferKindDb } from "@/lib/supabase/types";

/** Admin's view of an offer (includes inactive/scheduled ones). */
export interface AdminOffer {
  id: string;
  kind: OfferKindDb;
  titleAr: string;
  titleEn: string;
  productId: string | null;
  buyQty: number | null;
  freeQty: number | null;
  minCartTotal: number | null;
  percent: number | null;
  /** cart_percent alternative: a flat IQD amount off */
  fixedAmount: number | null;
  deliveryFee: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}

const base = {
  titleAr: z.string().trim().min(1).max(120),
  titleEn: z.string().trim().min(1).max(120),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
};

// Mirrors the DB `offers_shape` CHECK — reject malformed offers before the DB does.
const createOfferSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("bundle"),
    ...base,
    productId: z.string().min(1),
    buyQty: z.number().int().min(1).max(20),
    freeQty: z.number().int().min(1).max(20),
  }),
  z.object({
    kind: z.literal("flash"),
    ...base,
    productId: z.string().min(1),
    percent: z.number().int().min(1).max(90),
    endsAt: z.string().datetime(),
  }),
  // percent OR a flat IQD amount off the cart — exactly one of the two
  z.object({
    kind: z.literal("cart_percent"),
    ...base,
    minCartTotal: z.number().int().min(0).max(100_000_000),
    percent: z.number().int().min(1).max(90).nullable().optional(),
    fixedAmount: z.number().int().min(1).max(10_000_000).nullable().optional(),
  }),
  z.object({
    kind: z.literal("cart_delivery"),
    ...base,
    minCartTotal: z.number().int().min(0).max(100_000_000),
    deliveryFee: z.number().int().min(0).max(100_000),
  }),
]);

export type CreateOfferInput = z.input<typeof createOfferSchema>;

function revalidateOffers() {
  revalidateTag(TAGS.offers, "max");
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/dashboard/offers");
}

export async function createOfferAction(
  input: CreateOfferInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = createOfferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const o = parsed.data;

  // A cart_percent offer must carry either a percent or a fixed amount.
  if (o.kind === "cart_percent" && !o.percent && !o.fixedAmount) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("offers").insert({
    kind: o.kind,
    title_ar: o.titleAr,
    title_en: o.titleEn,
    product_id: "productId" in o ? o.productId : null,
    buy_qty: o.kind === "bundle" ? o.buyQty : null,
    free_qty: o.kind === "bundle" ? o.freeQty : null,
    min_cart_total: "minCartTotal" in o ? o.minCartTotal : null,
    percent: "percent" in o ? o.percent ?? null : null,
    fixed_amount: o.kind === "cart_percent" ? o.fixedAmount ?? null : null,
    delivery_fee: o.kind === "cart_delivery" ? o.deliveryFee : null,
    starts_at: o.startsAt ?? null,
    ends_at: o.endsAt ?? null,
    active: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidateOffers();
  return { ok: true };
}

export async function setOfferActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("offers").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateOffers();
  return { ok: true };
}

export async function deleteOfferAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("offers")
    .update({ is_deleted: true, active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateOffers();
  return { ok: true };
}

/* ------------------------------- Coupons -------------------------------- */

export interface AdminCoupon {
  code: string;
  discountType: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  active: boolean;
  usageLimit: number | null;
  usedCount: number;
  perUserLimit: number | null;
  targetUserIds: string[] | null;
  productIds: string[] | null;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

/** All live coupons (service role — admin-gated by requireAdmin). */
export async function getAdminCoupons(): Promise<AdminCoupon[]> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((c) => ({
    code: c.code,
    discountType: c.discount_type as "percent" | "fixed",
    value: c.value,
    minSubtotal: c.min_subtotal,
    active: c.active,
    usageLimit: c.usage_limit,
    usedCount: c.used_count,
    perUserLimit: c.per_user_limit,
    targetUserIds: c.target_user_ids,
    productIds: c.product_ids,
    title: c.title,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
  }));
}

/** Resolve customer emails → auth user ids so a coupon can target people. */
async function resolveUserIds(emails: string[]): Promise<string[]> {
  const wanted = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [];

  const supabase = createAdminClient();
  const ids: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email && wanted.has(u.email.toLowerCase())) ids.push(u.id);
    }
    if (data.users.length < 1000) break;
  }
  return ids;
}

const createCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "letters, digits, dash and underscore only"),
  title: z.string().trim().max(120).optional().default(""),
  discountType: z.enum(["percent", "fixed"]),
  /** percent 1–90, or a flat IQD amount */
  value: z.number().int().min(1).max(10_000_000),
  minSubtotal: z.number().int().min(0).max(100_000_000).optional().default(0),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(1000).nullable().optional(),
  /** empty = applies to the whole cart */
  productIds: z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
  /** empty = everyone */
  targetEmails: z.array(z.string().trim().email().max(160)).max(200).optional().default([]),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export type CreateCouponInput = z.input<typeof createCouponSchema>;

export async function createCouponAction(
  input: CreateCouponInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = createCouponSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const c = parsed.data;
  if (c.discountType === "percent" && c.value > 90) return { ok: false, error: "invalid_input" };

  const targetUserIds = await resolveUserIds(c.targetEmails);
  // Asked to target specific people but none matched → refuse rather than
  // silently creating a coupon that everyone can use.
  if (c.targetEmails.length > 0 && targetUserIds.length === 0) {
    return { ok: false, error: "no_matching_users" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("coupons").insert({
    code: c.code.toUpperCase(),
    title: c.title || null,
    discount_type: c.discountType,
    value: c.value,
    min_subtotal: c.minSubtotal,
    usage_limit: c.usageLimit ?? null,
    per_user_limit: c.perUserLimit ?? null,
    product_ids: c.productIds.length > 0 ? c.productIds : null,
    target_user_ids: targetUserIds.length > 0 ? targetUserIds : null,
    starts_at: c.startsAt ?? null,
    ends_at: c.endsAt ?? null,
    active: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/offers");
  return { ok: true };
}

export async function setCouponActiveAction(
  code: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("coupons").update({ active }).eq("code", code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/offers");
  return { ok: true };
}

export async function deleteCouponAction(code: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("coupons")
    .update({ is_deleted: true, active: false })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/offers");
  return { ok: true };
}

/* ------------------- Delivery fees & landing-page stats ------------------ */

const deliverySchema = z.object({
  deliveryFeeDefault: z.number().int().min(0).max(1_000_000),
  deliveryFeeKarbala: z.number().int().min(0).max(1_000_000),
});

export async function updateDeliveryFeesAction(input: {
  deliveryFeeDefault: number;
  deliveryFeeKarbala: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({
      delivery_fee_default: parsed.data.deliveryFeeDefault,
      delivery_fee_karbala: parsed.data.deliveryFeeKarbala,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.settings, "max");
  revalidatePath("/");
  revalidatePath("/dashboard/offers");
  return { ok: true };
}

const statsSchema = z.object({
  statFollowers: z.string().trim().min(1).max(12),
  statProducts: z.string().trim().min(1).max(12),
  statRating: z.string().trim().min(1).max(12),
});

export async function updateLandingStatsAction(input: {
  statFollowers: string;
  statProducts: string;
  statRating: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = statsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("settings")
    .update({
      stat_followers: parsed.data.statFollowers,
      stat_products: parsed.data.statProducts,
      stat_rating: parsed.data.statRating,
    })
    .eq("id", true);
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.settings, "max");
  revalidatePath("/");
  revalidatePath("/dashboard/offers");
  return { ok: true };
}

/* --------------------------- Custom pricing ----------------------------- */

const customPricingSchema = z.object({
  kind: z.enum(["brooch", "sticker", "poster"]),
  unitPrice: z.number().int().min(0).max(10_000_000),
  waterproofExtra: z.number().int().min(0).max(10_000_000),
});

/** Update a custom-request unit price (admin). Used by the dashboard editor. */
export async function updateCustomPricingAction(input: {
  kind: "brooch" | "sticker" | "poster";
  unitPrice: number;
  waterproofExtra: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = customPricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("custom_pricing")
    .update({ unit_price: p.unitPrice, waterproof_extra: p.waterproofExtra })
    .eq("kind", p.kind);
  if (error) return { ok: false, error: error.message };

  // The storefront modal reads pricing through the settings-tagged cache.
  revalidateTag(TAGS.settings, "max");
  revalidatePath("/dashboard/offers");
  return { ok: true };
}

/** All offers (admin sees every row via RLS, including inactive/deleted-not). */
export async function getAdminOffers(): Promise<AdminOffer[]> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("offers")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((o) => ({
    id: o.id,
    kind: o.kind,
    titleAr: o.title_ar,
    titleEn: o.title_en,
    productId: o.product_id,
    buyQty: o.buy_qty,
    freeQty: o.free_qty,
    minCartTotal: o.min_cart_total,
    percent: o.percent,
    fixedAmount: o.fixed_amount,
    deliveryFee: o.delivery_fee,
    startsAt: o.starts_at,
    endsAt: o.ends_at,
    active: o.active,
  }));
}
