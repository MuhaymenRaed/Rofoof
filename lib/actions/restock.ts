"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { revalidateCatalog } from "@/lib/cache";
import {
  getRestockQueue,
  getRestockItemDetail,
  type RestockFilters,
  type RestockQueuePage,
  type RestockItemDetail,
} from "@/lib/data/restock";

function revalidateRestock() {
  revalidateCatalog();
  revalidatePath("/dashboard/restock");
}

/** Next page of the restock queue (infinite scroll), or a fresh page 0 after a filter/search/sort change. */
export async function loadMoreRestockQueueAction(
  offset: number,
  filters: RestockFilters,
): Promise<RestockQueuePage> {
  await requireAdmin();
  return getRestockQueue(offset, 20, filters);
}

export async function getRestockItemDetailAction(
  productId: string,
  itemId: string | null,
): Promise<RestockItemDetail | null> {
  await requireAdmin();
  return getRestockItemDetail(productId, itemId);
}

const applyRestockSchema = z.object({
  productId: z.string().min(1),
  itemId: z.string().uuid().nullable(),
  qty: z.number().int().min(1).max(100000),
});

/** Add `qty` to the shelf and clear this row out of the queue until it sells again. */
export async function applyRestockAction(input: {
  productId: string;
  itemId: string | null;
  qty: number;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = applyRestockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_apply_restock", {
    p_product_id: parsed.data.productId,
    p_item_id: parsed.data.itemId,
    p_qty: parsed.data.qty,
  });
  if (error) return { ok: false, error: error.message };

  revalidateRestock();
  return { ok: true };
}

const blacklistSchema = z.object({
  productId: z.string().min(1),
  itemId: z.string().uuid().nullable(),
  blacklisted: z.boolean(),
});

/** Mute (or unmute) a row from the restock queue — no stock change. */
export async function setRestockBlacklistAction(input: {
  productId: string;
  itemId: string | null;
  blacklisted: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = blacklistSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_restock_blacklist", {
    p_product_id: parsed.data.productId,
    p_item_id: parsed.data.itemId,
    p_blacklisted: parsed.data.blacklisted,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/restock");
  return { ok: true };
}
