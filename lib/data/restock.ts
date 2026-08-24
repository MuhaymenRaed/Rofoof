import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProductKind } from "@/lib/products";

export type RestockSort = "demand_desc" | "date_asc" | "date_desc" | "orders_asc" | "orders_desc";

export interface RestockFilters {
  search?: string;
  /** category codes, OR-ed */
  categories?: string[];
  kind?: ProductKind | null;
  sort?: RestockSort;
  blacklisted?: boolean;
}

/** One shelf unit in the queue: a whole product, or one design of a package. */
export interface RestockQueueItem {
  productId: string;
  /** null for standard/tiered products; a product_items id for a package design */
  itemId: string | null;
  nameAr: string;
  nameEn: string;
  itemNameAr: string | null;
  itemNameEn: string | null;
  imageUrl: string | null;
  categoryCode: string;
  kind: ProductKind;
  stock: number;
  /** units sold, ever, with stock actually taken off the shelf */
  lifetimeSold: number;
  /** distinct orders that ever included this shelf unit */
  ordersCount: number;
  lastSoldAt: string | null;
  /** the number driving the queue: lifetimeSold − restockBaseline */
  soldSinceRestock: number;
  blacklisted: boolean;
  lastRestockedQty: number | null;
  restockedAt: string | null;
  /**
   * When the admin last discarded this row — "leave the shelf as it is". A row
   * carrying one is a row that came BACK: it was discarded, and has sold again
   * since. Null until docs/restock-queue.sql STEP 6 has been run, so read it as
   * "unknown", never as "never discarded".
   */
  dismissedAt: string | null;
  /** When this row started being counted at all (STEP 1B's "start from now"). */
  trackingStartedAt: string | null;
  createdAt: string;
}

export interface RestockItemDetail extends RestockQueueItem {
  recentOrders: { code: string; createdAt: string; qty: number }[];
}

/**
 * Why the queue is empty, when it is empty for a reason other than "nothing
 * has sold yet".
 *
 * This exists because the first version returned a bare `[]` on ANY error, so
 * a broken RPC rendered as the cheerful "nothing needs restocking 🎉" empty
 * state — indistinguishable from a tidy shop. A `search_path` bug hid behind
 * that for a whole release. An empty list must be able to say why it is empty.
 */
export type RestockFailure = { kind: "migration" } | { kind: "error"; message: string };

export interface RestockQueuePage {
  items: RestockQueueItem[];
  hasMore: boolean;
  failure?: RestockFailure | null;
}

/**
 * Is this "docs/restock-queue.sql hasn't been run" — as opposed to a fault
 * inside a function that IS installed?
 *
 * The name check matters: 42883 (undefined_function) is also what Postgres
 * raises when one of OUR functions calls something IT cannot resolve —
 * `similarity()` from pg_trgm being the real example. Treating that as "not
 * migrated yet" would tell the admin to run SQL they have already run, while
 * hiding the actual message that says what is wrong.
 */
export function isMissingRestockFn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // PostgREST couldn't find the function at all (not in its schema cache).
  if (error.code === "PGRST202") return true;
  return (
    error.code === "42883" &&
    /admin_restock_queue|admin_restock_item_detail|admin_apply_restock|admin_set_restock_blacklist|admin_dismiss_restock/i.test(
      error.message ?? "",
    )
  );
}

interface RestockRow {
  product_id: string;
  item_id: string | null;
  name_ar: string;
  name_en: string;
  item_name_ar: string | null;
  item_name_en: string | null;
  image_url: string | null;
  category_code: string;
  kind: string;
  stock: number | null;
  lifetime_sold: number | null;
  orders_count: number | null;
  last_sold_at: string | null;
  restock_baseline: number | null;
  restock_blacklisted: boolean | null;
  restock_last_qty: number | null;
  restocked_at: string | null;
  // Optional, not `| null`: these two arrive only once STEP 1B/STEP 6 of
  // docs/restock-queue.sql have been run. The queue keeps working without
  // them — see the fallbacks in mapRestockRow.
  restock_dismissed_at?: string | null;
  restock_tracking_started_at?: string | null;
  created_at: string;
  recent_orders?: { code: string; created_at: string; qty: number }[];
}

function mapRestockRow(row: RestockRow): RestockQueueItem {
  const lifetimeSold = Number(row.lifetime_sold ?? 0);
  const baseline = Number(row.restock_baseline ?? 0);
  return {
    productId: row.product_id,
    itemId: row.item_id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    itemNameAr: row.item_name_ar,
    itemNameEn: row.item_name_en,
    imageUrl: row.image_url,
    categoryCode: row.category_code,
    kind: row.kind as ProductKind,
    stock: Number(row.stock ?? 0),
    lifetimeSold,
    ordersCount: Number(row.orders_count ?? 0),
    lastSoldAt: row.last_sold_at,
    soldSinceRestock: Math.max(0, lifetimeSold - baseline),
    blacklisted: Boolean(row.restock_blacklisted),
    lastRestockedQty: row.restock_last_qty,
    restockedAt: row.restocked_at,
    dismissedAt: row.restock_dismissed_at ?? null,
    trackingStartedAt: row.restock_tracking_started_at ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Pull the readable parts out of whatever came back as an error.
 *
 * `console.error("...", error)` printed a bare `{}` for the very failure this
 * feature needed diagnosing: an `Error` keeps `message` and `stack` on the
 * prototype as NON-enumerable properties, so every structured logger — Next's
 * dev overlay included — serialises it to nothing. Reading the fields by name
 * is the only way to get them out, whether it's a PostgrestError (message /
 * code / details / hint) or a plain thrown Error.
 */
function describeError(error: unknown): { message: string; detail: Record<string, unknown> } {
  const e = error as Record<string, unknown> | null;
  const pick = (k: string) => (typeof e?.[k] === "string" ? (e[k] as string) : undefined);
  const message =
    pick("message") ?? pick("msg") ?? (error == null ? "unknown_error" : String(error));
  return {
    message,
    detail: {
      name: pick("name"),
      message,
      code: e?.code,
      details: e?.details,
      hint: e?.hint,
      status: e?.status,
      // Last resort for a shape none of the above covers.
      raw: typeof error === "object" ? Object.getOwnPropertyNames(e ?? {}) : String(error),
    },
  };
}

/**
 * A page of the restock queue (admin only — call requireAdmin() first; RLS
 * also gates admin_restock_queue() itself via is_admin()). Fetches `limit + 1`
 * rows to detect `hasMore` without a separate count query, mirroring
 * getInventory()/getCustomers() in lib/data/dashboard.ts.
 */
export async function getRestockQueue(
  offset = 0,
  limit = 20,
  filters: RestockFilters = {},
): Promise<RestockQueuePage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_restock_queue", {
    p_search: filters.search?.trim() || null,
    p_categories: filters.categories && filters.categories.length > 0 ? filters.categories : null,
    p_kind: filters.kind ?? null,
    p_sort: filters.sort ?? "demand_desc",
    p_blacklisted: filters.blacklisted ?? false,
    p_limit: limit + 1,
    p_offset: offset,
  });

  if (error) {
    if (isMissingRestockFn(error)) {
      return { items: [], hasMore: false, failure: { kind: "migration" } };
    }
    const { message, detail } = describeError(error);
    console.error("[dashboard] restockQueue:", message, detail);
    return { items: [], hasMore: false, failure: { kind: "error", message } };
  }
  const rows = (data ?? []) as unknown as RestockRow[];
  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(mapRestockRow), hasMore, failure: null };
}

/** Full stats + recent order history for one row's detail modal. */
export async function getRestockItemDetail(
  productId: string,
  itemId: string | null,
): Promise<RestockItemDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_restock_item_detail", {
    p_product_id: productId,
    p_item_id: itemId,
  });
  if (error) {
    if (!isMissingRestockFn(error)) {
      const { message, detail } = describeError(error);
      console.error("[dashboard] restockItemDetail:", message, detail);
    }
    return null;
  }
  if (!data) return null;
  const row = data as unknown as RestockRow;
  return {
    ...mapRestockRow(row),
    recentOrders: (row.recent_orders ?? []).map((o) => ({
      code: o.code,
      createdAt: o.created_at,
      qty: Number(o.qty ?? 0),
    })),
  };
}
