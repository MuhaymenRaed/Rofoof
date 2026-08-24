"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { revalidateCatalog } from "@/lib/cache";
import {
  getRestockQueue,
  getRestockItemDetail,
  isMissingRestockFn,
  type RestockFilters,
  type RestockQueuePage,
  type RestockItemDetail,
} from "@/lib/data/restock";

function revalidateRestock() {
  revalidateCatalog();
  revalidatePath("/dashboard/restock");
}

/**
 * Turn a failed RPC into something the dashboard can say out loud.
 *
 * `"migration"` gets its own code because it is both the likeliest reason one
 * of these calls fails and the only one the admin can fix in a minute:
 * docs/restock-queue.sql has not been run on this database yet. Everything
 * else keeps its own message — a button that fails silently is the same trap
 * the empty-list-with-no-reason was (see RestockFailure in lib/data/restock.ts).
 */
function rpcFailure(error: { code?: string; message?: string }): { ok: false; error: string } {
  return { ok: false, error: isMissingRestockFn(error) ? "migration" : error.message || "error" };
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
  if (error) return rpcFailure(error);

  revalidateRestock();
  return { ok: true };
}

const dismissSchema = z.object({
  productId: z.string().min(1),
  itemId: z.string().uuid().nullable(),
});

/**
 * Discard one row: leave the shelf exactly as it is, and take the row out of
 * the queue until it sells again.
 *
 * Deliberately NOT the blacklist. Blacklisting mutes a row for good and needs
 * an admin to remember to un-mute it; a discard settles only what has sold so
 * far, so the next sale brings the row straight back on its own. It changes no
 * stock, which is why it doesn't revalidate the catalogue the way a restock
 * does — only the dashboard's own list moves.
 */
export async function dismissRestockAction(input: {
  productId: string;
  itemId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = dismissSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_dismiss_restock", {
    p_product_id: parsed.data.productId,
    p_item_id: parsed.data.itemId,
  });
  if (error) return rpcFailure(error);

  revalidatePath("/dashboard/restock");
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
  if (error) return rpcFailure(error);

  revalidatePath("/dashboard/restock");
  return { ok: true };
}
