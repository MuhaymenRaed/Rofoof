"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { TAGS } from "@/lib/data/tags";
import { revalidateCatalog } from "@/lib/cache";
import { getInventory, type InventoryPage } from "@/lib/data/dashboard";
import { getStockIndex, type StockFilter, type StockCounts } from "@/lib/data/stock";
import { cardImageOf } from "@/lib/products";
import type { CategoryGroup, CategoryInfo, SubcategoryInfo } from "@/lib/products";

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
  /** flat IQD off — alternative to discountPercent (the better of the two wins) */
  discountFixed: z.number().int().min(0).max(10_000_000).optional().default(0),
  /** priced by the GLOBAL by-count ladder shared across the whole order */
  volumePriced: z.boolean().optional().default(false),
  images: z.array(z.string().url()).max(120).optional().default([]),
  /**
   * Which of `images` is the thumbnail. Ignored when it names a photo that
   * isn't in the set — the client decides the cover from the same rows it sends
   * as `images`, so a mismatch is a bug, not an instruction to store a
   * thumbnail the product hasn't got.
   */
  coverUrl: z.string().url().optional(),
  /**
   * An image uploaded for the product CARD alone — never shown in the gallery
   * or the lightbox, and deliberately not a member of `images`.
   *
   * "" clears it, which is why this is a union rather than a plain url: there
   * is no other way to say "drop the special image and go back to the starred
   * photo", and omitting the field has to keep meaning "leave it as it is".
   */
  cardImage: z.union([z.literal(""), z.string().url()]).optional(),
  /**
   * Print masters, index-aligned with `images`; "" where a photo has none.
   * The empty string is a position-holder and the only reason this isn't a
   * plain url array — dropping the gaps would shift every later pair onto the
   * wrong photo. See Product.printImages.
   *
   * ABSENT means "leave the stored masters alone", and that is load-bearing,
   * not a convenience. The editor opens from two different lists: the dashboard
   * inventory, which carries the masters, and the store page, whose products
   * come from the PUBLIC catalogue and are deliberately stripped of them
   * (getProducts()). An editor opened from the store page therefore starts out
   * knowing nothing about them — and if "knows nothing" were sent as the empty
   * array, saving a price change from the store page would erase every print
   * master the product had. So the editor sends this only once it has actually
   * loaded them (getProductPrintImagesAction), and `undefined` is the honest
   * way to say it has not.
   */
  printImages: z
    .array(z.union([z.literal(""), z.string().url()]))
    .max(120)
    .optional(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default("#e8321a"),
  categories: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  /** second-level taxonomy codes nested under the chosen categories */
  subcategories: z.array(z.string().trim().min(1).max(60)).max(20).optional().default([]),
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
        /**
         * Units left of this design; the package's own stock column is unused.
         * null / absent = "don't touch it" — see the note on `stock` below.
         */
        stock: z.number().int().min(0).max(100000).nullable().optional(),
      }),
    )
    .max(120)
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
  /**
   * null / absent = leave the stored count exactly as it is.
   *
   * Stock is the one field on this form that the database changes on its own:
   * every accepted order takes pieces off, every cancellation puts them back.
   * The editor used to send back whatever number it had LOADED, so saving any
   * edit — a price, a category, a photo — silently restored the count to what
   * it was when the form opened, undoing every order accepted in between. To
   * the admin that looked like stock that never went down. Now the editor only
   * sends a count the admin actually typed, and this is what "not sent" means.
   */
  stock: z.number().int().min(0).max(100000).nullable().optional(),
  /** shown in the homepage "featured picks" showcase */
  isFeatured: z.boolean().optional().default(false),
  /** false = create only (fail on duplicate id) */
  isUpdate: z.boolean().optional().default(false),
});

export type UpsertProductInput = z.input<typeof upsertProductSchema>;

/**
 * Persist per-design stock as a plain row update, deliberately NOT through
 * admin_set_product_items.
 *
 * Teaching that function about stock would mean rewriting it, and rewriting it
 * means DROP FUNCTION first — Postgres won't change a function's return type in
 * place. Dropping and recreating a live function from a body nobody has read is
 * a bad trade for one integer column. Rows can be written directly with the
 * service-role client; only DDL can't (see AGENTS.md), so this stays in the app.
 *
 * Matching is by image_url because new designs are assigned their ids by the
 * RPC we just called, so the client has no id for them yet. Within one product
 * a design's image is unique — it IS the design.
 *
 * Returns an error message, or null when it worked (or when the column simply
 * isn't there yet, which is not a failure — the save still stands).
 */
async function writeItemStock(
  productId: string,
  items: { imageUrl: string; stock?: number | null }[],
): Promise<string | null> {
  // Only designs whose count the admin set. The rest are left to the number
  // the orders board has been maintaining — see the schema note on `stock`.
  const changed = items.flatMap((it) =>
    it.stock == null ? [] : [{ imageUrl: it.imageUrl, stock: it.stock }],
  );
  if (changed.length === 0) return null;

  // Service role deliberately. admin_set_product_items is SECURITY DEFINER, so
  // it writes these rows with the function's rights; a plain update from the
  // request-scoped client is subject to RLS instead, and an update that matches
  // no rows under RLS reports no error — it just silently does nothing. Stock
  // that quietly fails to save is worse than stock that fails loudly.
  const supabase = createAdminClient();

  const { data: saved, error: readErr } = await supabase
    .from("product_items")
    .select("id, image_url")
    .eq("product_id", productId)
    .eq("is_deleted", false);
  if (readErr || !saved) return readErr?.message ?? null;

  const wanted = new Map(changed.map((it) => [it.imageUrl, it.stock]));
  // One statement per distinct count rather than per design: a package is
  // nearly always restocked to a single number across every design, so this is
  // usually a single round trip instead of twenty.
  const idsByStock = new Map<number, string[]>();
  for (const row of saved) {
    const stock = wanted.get(row.image_url);
    if (stock === undefined) continue;
    const bucket = idsByStock.get(stock);
    if (bucket) bucket.push(row.id);
    else idsByStock.set(stock, [row.id]);
  }

  for (const [stock, ids] of idsByStock) {
    const { error } = await supabase.from("product_items").update({ stock }).in("id", ids);
    if (!error) continue;
    // Column not there yet → the rest of the product still saved correctly.
    if (error.code === "42703" || /stock/.test(error.message)) return null;
    return error.message;
  }
  return null;
}


/**
 * `print_images` trimmed to what it is worth storing: never longer than the
 * photo list it is aligned with, and with trailing gaps dropped.
 *
 * Trailing "" entries carry no information — `printImageFor()` reads a short
 * array as "no print file at that index" — so the common case (a product with
 * no print masters at all) stores `{}` rather than a row of empty strings.
 * Interior gaps are kept, because those DO hold a position.
 */
function tidyPrintImages(images: string[], printImages: string[]): string[] {
  const aligned = printImages.slice(0, images.length);
  let end = aligned.length;
  while (end > 0 && !aligned[end - 1]) end -= 1;
  return aligned.slice(0, end);
}

/**
 * PostgREST's "products.print_images isn't there yet" — in BOTH of the two
 * shapes it comes in, which are not the same error.
 *
 *   PGRST204  what a WRITE returns: "Could not find the 'print_images' column
 *             of 'products' in the schema cache". PostgREST resolves the
 *             columns of an insert/update against its cached schema before it
 *             builds any SQL, so Postgres is never asked.
 *   42703     what a READ returns: undefined_column, straight from Postgres,
 *             because a select's column list goes through as written.
 *
 * This is the write path, so PGRST204 is the one that actually fires here —
 * and getting it wrong is not a missing feature but a broken dashboard: every
 * product save would fail on an un-migrated database, print files or not.
 * 42703 is accepted too, so this keeps working if PostgREST ever stops
 * consulting the cache first.
 *
 * The message is still checked, so an unrelated unknown column is reported as
 * the error it is instead of being quietly retried away.
 */
function isMissingPrintImages(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const missing = error.code === "PGRST204" || error.code === "42703";
  return missing && /print_images/.test(error.message ?? "");
}

export interface UpsertProductResult {
  ok: boolean;
  error?: string;
  /**
   * The product saved, but something optional in it could not be stored.
   * `print_images_missing` means docs/product-print-images.sql hasn't been run,
   * so the print masters the admin just uploaded are sitting in the bucket
   * unreferenced. Reported rather than swallowed: the files are real work and
   * the admin would otherwise believe they are attached.
   */
  warning?: "print_images_missing";
}

/** Create or fully update a product (admin). Categories replace the whole set. */
export async function upsertProductAction(
  input: UpsertProductInput,
): Promise<UpsertProductResult> {
  await requireAdmin();
  const parsed = upsertProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const p = parsed.data;

  const supabase = await createSupabaseServerClient();
  // undefined = the editor does not know the masters, so the column is not
  // written at all. See the schema note on `printImages`.
  const printImages = p.printImages ? tidyPrintImages(p.images, p.printImages) : undefined;
  // The picture the CARD shows: the specially-uploaded one if there is one,
  // else the starred photo, else the first. Resolved once and used twice.
  const cardUrl = cardImageOf(p.images, p.cardImage, p.coverUrl) ?? null;
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
    discount_fixed: p.discountFixed,
    volume_priced: p.volumePriced,
    images: p.images,
    // The card image. Written here so a brand-new product has one from the
    // start, and written AGAIN after the RPCs below — see the note there.
    image_url: cardUrl,
    color: p.color,
    category_code: p.categories[0],
    waterproof: p.waterproof,
    waterproof_surcharge: p.waterproofSurcharge,
    allow_custom_image: p.allowCustomImage,
    kind: p.kind,
    is_featured: p.isFeatured,
    // Absent from the update entirely when not sent, so the column is not
    // touched — an `undefined` here would still be dropped by PostgREST, but
    // being explicit keeps the intent visible.
    ...(p.stock != null ? { stock: p.stock } : {}),
  };

  // A new product has no stored count to leave alone: it starts at what was
  // typed, or at zero.
  const save = (extra: Record<string, unknown>) =>
    p.isUpdate
      ? supabase
          .from("products")
          .update({ ...row, ...extra })
          .eq("id", p.id)
      : supabase
          .from("products")
          .insert({ ...row, ...extra, stock: p.stock ?? 0, emoji: "📦", is_active: true });

  // Print masters go in the same statement as the rest, and the WHOLE statement
  // is retried without them if the column isn't there. A second statement would
  // be the pattern used for the delivery banner switch, but that works only for
  // an update — an insert carrying an unknown column fails outright, so a new
  // product would not save at all on an un-migrated database.
  let warning: UpsertProductResult["warning"];
  let { error } = await save(printImages ? { print_images: printImages } : {});
  if (isMissingPrintImages(error)) {
    if (printImages && printImages.length > 0) warning = "print_images_missing";
    ({ error } = await save({}));
  }
  if (error) return { ok: false, error: error.message };

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

  // Replace the subcategory set (service-role: gated by requireAdmin above).
  const admin = createAdminClient();
  const { error: subDelErr } = await admin
    .from("product_subcategories")
    .delete()
    .eq("product_id", p.id);
  if (subDelErr) return { ok: false, error: subDelErr.message };
  if (p.subcategories.length > 0) {
    const { error: subErr } = await admin
      .from("product_subcategories")
      .insert(p.subcategories.map((code) => ({ product_id: p.id, subcategory_code: code })));
    if (subErr) return { ok: false, error: subErr.message };
  }

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

    const stockErr = await writeItemStock(p.id, p.items);
    if (stockErr) return { ok: false, error: stockErr };
  }

  // Volume-pricing ladder: replace-all for tiered products.
  if (p.kind === "tiered") {
    const { error: tiersErr } = await supabase.rpc("admin_set_price_tiers", {
      p_id: p.id,
      p_tiers: p.tiers.map((t) => ({ min_qty: t.minQty, unit_price: t.unitPrice })),
    });
    if (tiersErr) return { ok: false, error: tiersErr.message };
  }

  /**
   * The card image, written LAST — after every RPC above.
   *
   * THE BUG THIS FIXES: picking a thumbnail with the star saved, and the card
   * never changed. Across the whole catalogue `products.image_url` was still
   * the first photo of every single product, however many times an admin had
   * chosen a different one.
   *
   * `image_url` is set in the row update at the top of this function, but for a
   * package that update is followed by `admin_set_product_items` — a
   * SECURITY DEFINER function that predates the thumbnail picker, owns the
   * product's item list, and is the only thing that runs between the write and
   * the end. Whatever it does with the product's own image columns, it did it
   * after us, so our value never survived.
   *
   * Rather than rewrite a live function nobody has read (the same call made for
   * per-design stock — see writeItemStock), the admin's choice simply gets the
   * last word. One small update, and it cannot be overwritten by anything in
   * this function again.
   */
  const { error: coverErr } = await supabase
    .from("products")
    .update({ image_url: cardUrl })
    .eq("id", p.id);
  if (coverErr) return { ok: false, error: coverErr.message };

  revalidateCatalog();
  return { ok: true, warning };
}

/**
 * One product's print masters, index-aligned with its photos (admin).
 *
 * The editor opens over products from two different lists, and only one of them
 * carries these: the dashboard inventory does, the store page does not, because
 * its products come from the PUBLIC catalogue which is stripped of them so the
 * storefront never ships production artwork to shoppers (see getProducts()).
 *
 * Rather than make the editor behave differently depending on which button
 * opened it — the kind of difference nobody remembers when adding a third entry
 * point — it always asks for them here. One small admin-only read, on open.
 *
 * Returns [] both for "this product has none" and for a database without the
 * column; neither is an error, and the editor shows empty slots either way.
 */
export async function getProductPrintImagesAction(id: string): Promise<string[]> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("print_images")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return [];
  return (data.print_images ?? []).map((u) => u ?? "");
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

/**
 * Next page of the admin inventory list (infinite scroll), optionally narrowed
 * to the products holding an empty or a low shelf unit.
 *
 * The filter is resolved server-side over the WHOLE catalogue — see
 * getInventory(). Filtering in the browser only ever saw the pages that had
 * been scrolled in, so the answer changed as you scrolled.
 */
export async function loadMoreInventoryAction(
  offset: number,
  filter?: StockFilter,
): Promise<InventoryPage> {
  await requireAdmin();
  return getInventory(offset, 30, filter);
}

/**
 * Fresh whole-catalogue stock counts for the inventory list's filter chips.
 *
 * Re-read after every stock change (a save, an order accepted elsewhere) so the
 * numbers on the chips can't outlive the shelf they describe.
 */
export async function refreshStockCountsAction(): Promise<StockCounts> {
  await requireAdmin();
  const { counts } = await getStockIndex();
  return counts;
}

/* ------------------------------ Categories ------------------------------ */

const createCategorySchema = z.object({
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  /** which store filter row the chip joins; defaults to the subject row */
  group: z.enum(["type", "theme"]).optional().default("theme"),
});

export type CreateCategoryResult =
  | { ok: true; category: CategoryInfo }
  | { ok: false; error: string };

/**
 * Write a category's filter group, tolerating a database that hasn't got the
 * column yet (see AGENTS.md — schema and code land in either order).
 *
 * The failure is swallowed rather than surfaced: the chip still exists and
 * still filters, it just falls back to being grouped by its code until the
 * migration in docs/category-groups.sql is run. Reporting that to the admin as
 * a failed save would be a lie about what happened.
 */
async function writeCategoryGroup(code: string, group: CategoryGroup): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({ category_group: group })
    .eq("code", code);
  if (error) console.warn("[categories] category_group not written:", error.message);
}

/** Move an existing category between the store's two filter rows. */
export async function setCategoryGroupAction(
  code: string,
  group: CategoryGroup,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = z.enum(["type", "theme"]).safeParse(group);
  if (!parsed.success || !code.trim()) return { ok: false, error: "invalid_input" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({ category_group: parsed.data })
    .eq("code", code.trim());
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/");
  revalidatePath("/store");
  return { ok: true };
}

export async function createCategoryAction(input: {
  nameAr: string;
  nameEn: string;
  group?: CategoryGroup;
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

  const c = data as { code: string; name_ar: string; name_en: string; icon: string };
  // The RPC predates grouping and takes no group argument, so the row is
  // stamped straight afterwards, before the cache is dropped. Unconditional on
  // purpose: a re-created code that happens to match a built-in product type
  // must land where the admin put it, not where defaultCategoryGroup() guesses.
  await writeCategoryGroup(c.code, parsed.data.group);

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/");
  revalidatePath("/store");

  return {
    ok: true,
    category: {
      code: c.code,
      nameAr: c.name_ar,
      nameEn: c.name_en,
      icon: c.icon,
      group: parsed.data.group,
    },
  };
}

/* ----------------------------- Subcategories ---------------------------- */

const createSubcategorySchema = z.object({
  categoryCode: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
});

export type CreateSubcategoryResult =
  | { ok: true; subcategory: SubcategoryInfo }
  | { ok: false; error: string };

/** Add a subcategory under a category (admin). Code is derived from the name. */
export async function createSubcategoryAction(input: {
  categoryCode: string;
  nameAr: string;
  nameEn: string;
}): Promise<CreateSubcategoryResult> {
  await requireAdmin();
  const parsed = createSubcategorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { categoryCode, nameAr, nameEn } = parsed.data;

  const slug =
    nameEn
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 30) || `s${Date.now().toString(36)}`;
  const code = `${categoryCode}-${slug}`.slice(0, 60);

  const supabase = createAdminClient();
  const { error } = await supabase.from("subcategories").insert({
    code,
    category_code: categoryCode,
    name_ar: nameAr,
    name_en: nameEn,
  });
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/store");
  revalidatePath("/dashboard/inventory");
  return { ok: true, subcategory: { code, categoryCode, nameAr, nameEn } };
}

/** Soft-delete a subcategory (admin); products keep their history rows. */
export async function deleteSubcategoryAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("subcategories")
    .update({ is_deleted: true })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/store");
  revalidatePath("/dashboard/inventory");
  return { ok: true };
}

/**
 * Retire a category. Soft delete so historical orders keep resolving, and the
 * product_categories links are left alone — a category with no products simply
 * stops appearing in the chips.
 */
export async function deleteCategoryAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_deleted: true })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.categories, "max");
  revalidatePath("/");
  revalidatePath("/store");
  return { ok: true };
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

/** Retire a fandom (soft delete — see deleteCategoryAction). */
export async function deleteFandomAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("fandoms")
    .update({ is_deleted: true })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };

  revalidateTag(TAGS.fandoms, "max");
  revalidatePath("/store");
  return { ok: true };
}
