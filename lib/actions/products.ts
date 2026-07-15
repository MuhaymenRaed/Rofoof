"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { TAGS } from "@/lib/data/tags";
import { getInventory, type InventoryPage } from "@/lib/data/dashboard";

const upsertProductSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase, digits and dashes"),
  nameAr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  subAr: z.string().trim().max(120).optional().default(""),
  subEn: z.string().trim().max(120).optional().default(""),
  descAr: z.string().trim().max(1000).optional().default(""),
  descEn: z.string().trim().max(1000).optional().default(""),
  price: z.number().int().min(0).max(10_000_000),
  discountPercent: z.number().int().min(0).max(90).optional().default(0),
  images: z.array(z.string().url()).max(30).optional().default([]),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default("#e8321a"),
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  fandoms: z.array(z.string().trim().min(1).max(60)).max(8).optional().default([]),
  waterproof: z.boolean().optional().default(false),
  waterproofSurcharge: z.number().int().min(0).max(100000).optional().default(0),
  allowCustomImage: z.boolean().optional().default(false),
  kind: z.enum(["standard", "package", "tiered"]).optional().default("standard"),
  /** package contents; existing items carry their id, new ones don't */
  items: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        imageUrl: z.string().url(),
        nameAr: z.string().trim().max(120).optional().default(""),
        nameEn: z.string().trim().max(120).optional().default(""),
        price: z.number().int().min(0).max(10_000_000).nullable().optional(),
      }),
    )
    .max(30)
    .optional()
    .default([]),
  /** volume-pricing ladder for tiered products */
  tiers: z
    .array(
      z.object({
        minQty: z.number().int().min(1).max(999),
        unitPrice: z.number().int().min(0).max(10_000_000),
      }),
    )
    .max(10)
    .optional()
    .default([]),
  stock: z.number().int().min(0).max(100000).optional().default(0),
  /** false = create only (fail on duplicate id) */
  isUpdate: z.boolean().optional().default(false),
});

export type UpsertProductInput = z.input<typeof upsertProductSchema>;

function revalidateCatalog() {
  revalidateTag(TAGS.products, "max");
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/dashboard/inventory");
}

/** Create or fully update a product (admin). Categories replace the whole set. */
export async function upsertProductAction(
  input: UpsertProductInput,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = upsertProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  const row = {
    id: p.id,
    name_ar: p.nameAr,
    name_en: p.nameEn,
    sub_ar: p.subAr,
    sub_en: p.subEn,
    description_ar: p.descAr,
    description_en: p.descEn,
    price: p.price,
    discount_percent: p.discountPercent,
    images: p.images,
    image_url: p.images[0] ?? null,
    color: p.color,
    category_code: p.categories[0],
    waterproof: p.waterproof,
    waterproof_surcharge: p.waterproofSurcharge,
    allow_custom_image: p.allowCustomImage,
    kind: p.kind,
    stock: p.stock,
  };

  if (p.isUpdate) {
    const { error } = await supabase.from("products").update(row).eq("id", p.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("products")
      .insert({ ...row, emoji: "📦", is_active: true });
    if (error) return { ok: false, error: error.message };
  }

  // Replace the category set atomically (also syncs the primary column).
  const { error: catErr } = await supabase.rpc("admin_set_product_categories", {
    p_id: p.id,
    p_codes: p.categories,
  });
  if (catErr) return { ok: false, error: catErr.message };

  // Replace the fandom set (empty list allowed).
  const { error: fanErr } = await supabase.rpc("admin_set_product_fandoms", {
    p_id: p.id,
    p_codes: p.fandoms,
  });
  if (fanErr) return { ok: false, error: fanErr.message };

  // Package contents: replace the item set (removed ones are soft-deleted so
  // order history keeps pointing at them).
  if (p.kind === "package") {
    const { error: itemsErr } = await supabase.rpc("admin_set_product_items", {
      p_id: p.id,
      p_items: p.items.map((it, i) => ({
        id: it.id ?? null,
        image_url: it.imageUrl,
        name_ar: it.nameAr,
        name_en: it.nameEn,
        price: it.price ?? null,
        sort_order: i,
      })),
    });
    if (itemsErr) return { ok: false, error: itemsErr.message };
  }

  // Volume-pricing ladder: replace-all for tiered products.
  if (p.kind === "tiered") {
    const { error: tiersErr } = await supabase.rpc("admin_set_price_tiers", {
      p_id: p.id,
      p_tiers: p.tiers.map((t) => ({ min_qty: t.minQty, unit_price: t.unitPrice })),
    });
    if (tiersErr) return { ok: false, error: tiersErr.message };
  }

  revalidateCatalog();
  return { ok: true };
}

/** Soft-delete a product (hidden everywhere; restorable in SQL). */
export async function deleteProductAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateCatalog();
  return { ok: true };
}

export async function setProductActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("products").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateCatalog();
  return { ok: true };
}

/** Next page of the admin inventory list (infinite scroll). */
export async function loadMoreInventoryAction(offset: number): Promise<InventoryPage> {
  await requireAdmin();
  return getInventory(offset);
}

/* ------------------------------ Categories ------------------------------ */

const createCategorySchema = z.object({
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
});

export type CreateCategoryResult =
  | { ok: true; category: { code: string; nameAr: string; nameEn: string; icon: string } }
  | { ok: false; error: string };

export async function createCategoryAction(input: {
  nameAr: string;
  nameEn: string;
}): Promise<CreateCategoryResult> {
  await requireAdmin();
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const code =
    parsed.data.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || `cat-${Date.now().toString(36)}`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_create_category", {
    p_code: code,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
  });
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/");
  revalidatePath("/store");

  const c = data as { code: string; name_ar: string; name_en: string; icon: string };
  return {
    ok: true,
    category: { code: c.code, nameAr: c.name_ar, nameEn: c.name_en, icon: c.icon },
  };
}

/* ------------------------------- Fandoms -------------------------------- */

export type CreateFandomResult =
  | { ok: true; fandom: { code: string; nameAr: string; nameEn: string } }
  | { ok: false; error: string };

export async function createFandomAction(input: {
  nameAr: string;
  nameEn: string;
}): Promise<CreateFandomResult> {
  await requireAdmin();
  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const code =
    parsed.data.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || `fandom-${Date.now().toString(36)}`;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_create_fandom", {
    p_code: code,
    p_name_ar: parsed.data.nameAr,
    p_name_en: parsed.data.nameEn,
  });
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.fandoms, "max");
  revalidatePath("/store");

  const f = data as { code: string; name_ar: string; name_en: string };
  return { ok: true, fandom: { code: f.code, nameAr: f.name_ar, nameEn: f.name_en } };
}
