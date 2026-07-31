"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { TAGS } from "@/lib/data/tags";
import type { FeaturedGroup } from "@/lib/products";

/**
 * Home-page showcase groups. Each group is its own titled rail between "most
 * ordered" and "just landed"; a product can sit in any number of them.
 */

type Result = { ok: boolean; error?: string };

function revalidateShowcase() {
  revalidateTag(TAGS.products, "max");
  revalidateTag(TAGS.settings, "max");
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/dashboard/featured");
}

const nameSchema = z.object({
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
});

export type CreateGroupResult = { ok: true; group: FeaturedGroup } | { ok: false; error: string };

/** Add a new showcase group; it lands at the bottom of the existing ones. */
export async function createFeaturedGroupAction(input: {
  nameAr: string;
  nameEn: string;
}): Promise<CreateGroupResult> {
  await requireAdmin();
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from("featured_groups")
    .select("sort_order")
    .eq("is_deleted", false)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("featured_groups")
    .insert({
      name_ar: parsed.data.nameAr,
      name_en: parsed.data.nameEn,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select("id, name_ar, name_en, sort_order")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };

  revalidateShowcase();
  return {
    ok: true,
    group: {
      id: data.id,
      nameAr: data.name_ar,
      nameEn: data.name_en,
      order: data.sort_order,
      productIds: [],
    },
  };
}

/** Rename a group (from the dashboard or inline on the home page). */
export async function renameFeaturedGroupAction(
  id: string,
  input: { nameAr: string; nameEn: string },
): Promise<Result> {
  await requireAdmin();
  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("featured_groups")
    .update({ name_ar: parsed.data.nameAr, name_en: parsed.data.nameEn })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateShowcase();
  return { ok: true };
}

/** Retire a group. Soft delete — its product links stay, so it can be restored. */
export async function deleteFeaturedGroupAction(id: string): Promise<Result> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("featured_groups")
    .update({ is_deleted: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateShowcase();
  return { ok: true };
}

/** Move a group up/down the home page by swapping sort_order with its neighbour. */
export async function moveFeaturedGroupAction(id: string, dir: -1 | 1): Promise<Result> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { data: groups, error } = await supabase
    .from("featured_groups")
    .select("id, sort_order")
    .eq("is_deleted", false)
    .order("sort_order", { ascending: true });
  if (error || !groups) return { ok: false, error: error?.message ?? "load_failed" };

  const index = groups.findIndex((g) => g.id === id);
  const target = index + dir;
  if (index === -1 || target < 0 || target >= groups.length) return { ok: true }; // already at the edge

  const a = groups[index];
  const b = groups[target];
  // Swap positions. Written as two updates because the pair may share a value
  // (legacy rows all defaulted to 0), in which case we renumber deterministically.
  const aOrder = a.sort_order === b.sort_order ? index : a.sort_order;
  const bOrder = a.sort_order === b.sort_order ? target : b.sort_order;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabase.from("featured_groups").update({ sort_order: bOrder }).eq("id", a.id),
    supabase.from("featured_groups").update({ sort_order: aOrder }).eq("id", b.id),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)!.message };

  revalidateShowcase();
  return { ok: true };
}

/** Add or remove one product from one group (the star picker on a card). */
export async function toggleProductInGroupAction(
  groupId: string,
  productId: string,
  member: boolean,
): Promise<Result> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const { error } = member
    ? await supabase
        .from("featured_group_products")
        .upsert({ group_id: groupId, product_id: productId })
    : await supabase
        .from("featured_group_products")
        .delete()
        .eq("group_id", groupId)
        .eq("product_id", productId);
  if (error) return { ok: false, error: error.message };

  revalidateShowcase();
  return { ok: true };
}

/** Replace the full set of groups a product belongs to (the product editor). */
export async function setProductGroupsAction(
  productId: string,
  groupIds: string[],
): Promise<Result> {
  await requireAdmin();
  const clean = Array.from(new Set(groupIds.filter(Boolean))).slice(0, 50);
  const supabase = await createSupabaseServerClient();

  const { error: delErr } = await supabase
    .from("featured_group_products")
    .delete()
    .eq("product_id", productId);
  if (delErr) return { ok: false, error: delErr.message };

  if (clean.length > 0) {
    const { error } = await supabase
      .from("featured_group_products")
      .insert(clean.map((group_id) => ({ group_id, product_id: productId })));
    if (error) return { ok: false, error: error.message };
  }

  revalidateShowcase();
  return { ok: true };
}

/** Bulk-add a whole category / subfilter / fandom into one group. */
export async function addProductsToGroupAction(
  groupId: string,
  productIds: string[],
): Promise<Result> {
  await requireAdmin();
  const clean = Array.from(new Set(productIds.filter(Boolean))).slice(0, 500);
  if (clean.length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("featured_group_products")
    .upsert(clean.map((product_id) => ({ group_id: groupId, product_id })));
  if (error) return { ok: false, error: error.message };

  revalidateShowcase();
  return { ok: true };
}
