"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  z.object({
    kind: z.literal("cart_percent"),
    ...base,
    minCartTotal: z.number().int().min(0).max(100_000_000),
    percent: z.number().int().min(1).max(90),
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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("offers").insert({
    kind: o.kind,
    title_ar: o.titleAr,
    title_en: o.titleEn,
    product_id: "productId" in o ? o.productId : null,
    buy_qty: o.kind === "bundle" ? o.buyQty : null,
    free_qty: o.kind === "bundle" ? o.freeQty : null,
    min_cart_total: "minCartTotal" in o ? o.minCartTotal : null,
    percent: "percent" in o ? o.percent : null,
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
    deliveryFee: o.delivery_fee,
    startsAt: o.starts_at,
    endsAt: o.ends_at,
    active: o.active,
  }));
}
