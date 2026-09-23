import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingColumn } from "./mappers";
import {
  lowStockUnits,
  outOfStockUnits,
  stockUnitsFor,
  type StockShape,
} from "@/lib/products";

/** Which shelf units a stock view is asking for. */
export type StockFilter = "out" | "low";

export interface StockCounts {
  /** Products with at least one unit left to sell. */
  inStock: number;
  /** Shelf units at zero — designs, or the product itself. */
  outUnits: number;
  /** Shelf units below LOW_STOCK_BELOW but not yet at zero. */
  lowUnits: number;
  /** Products holding at least one empty unit (what the list filter shows). */
  outProducts: number;
  /** Products holding at least one low unit. */
  lowProducts: number;
}

export interface StockIndex {
  /** Product ids holding an empty unit, worst first. */
  out: string[];
  /** Product ids holding a low unit, worst first. */
  low: string[];
  counts: StockCounts;
}

const EMPTY_INDEX: StockIndex = {
  out: [],
  low: [],
  counts: { inStock: 0, outUnits: 0, lowUnits: 0, outProducts: 0, lowProducts: 0 },
};

/** One product reduced to the only thing this module cares about. */
interface StockRow {
  id: string;
  kind: string;
  stock: number | null;
  sortOrder: number;
}

const PAGE = 1000;
const MAX_PAGES = 20;

/**
 * Every shelf unit in the shop, counted once, live.
 *
 * WHY THIS EXISTS: the two screens that report stock used to count different
 * things from different sources, so they could not agree.
 *
 *  - The inventory list filtered the thirty rows it had already fetched. The
 *    catalogue is a hundred products deep, so a design that ran out on page
 *    three was simply not in the array the filter ran over — the button said
 *    "1" and listed one product while two were empty. Scrolling changed the
 *    answer, which is the tell.
 *  - The KPI tiles counted the cached PUBLIC catalogue: active products only,
 *    five minutes stale. A hidden product was invisible to it, and accepting an
 *    order moved the list immediately but left the tile behind.
 *
 * Both now read this. It scans the same set the inventory list pages through
 * (`is_deleted = false`, hidden products included — a shelf is empty whether or
 * not the product is on show) and splits a package into its designs through
 * stockUnitsFor(), the same helper the storefront greys a design out by. One
 * source, one definition, so the tile, the filter and the shop cannot drift.
 *
 * Two small reads, four columns each — a hundred products and a few hundred
 * designs — so it is cheap enough to stay uncached and always true.
 */
export async function getStockIndex(): Promise<StockIndex> {
  const supabase = await createSupabaseServerClient();

  const products: StockRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("products")
      .select("id, kind, stock, sort_order")
      .eq("is_deleted", false)
      .order("sort_order", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[stock] products:", error);
      return page === 0 ? EMPTY_INDEX : buildIndex(products, new Map());
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      products.push({
        id: r.id,
        kind: r.kind ?? "standard",
        stock: r.stock ?? null,
        sortOrder: r.sort_order ?? 0,
      });
    }
    if (data.length < PAGE) break;
  }

  // Only the designs a shopper can actually pick, exactly as mapProduct()
  // filters them — a retired design must not hold the shop in "out of stock".
  const designs = new Map<string, (number | null)[]>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("product_items")
      .select("product_id, stock")
      .eq("is_active", true)
      .eq("is_deleted", false)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      // No per-design stock column yet (see AGENTS.md — schema and code land in
      // either order). Every product then counts by its own row, which is what
      // the shop did before designs carried their own count.
      if (!isMissingColumn(error)) console.error("[stock] product_items:", error);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const list = designs.get(r.product_id);
      if (list) list.push(r.stock ?? null);
      else designs.set(r.product_id, [r.stock ?? null]);
    }
    if (data.length < PAGE) break;
  }

  return buildIndex(products, designs);
}

function buildIndex(products: StockRow[], designs: Map<string, (number | null)[]>): StockIndex {
  const counts: StockCounts = {
    inStock: 0,
    outUnits: 0,
    lowUnits: 0,
    outProducts: 0,
    lowProducts: 0,
  };
  // Worst first, then the admin's own ordering — so the product with four dead
  // designs is the one on screen, not the one that happens to sort highest.
  const out: { id: string; n: number; sortOrder: number }[] = [];
  const low: { id: string; n: number; sortOrder: number }[] = [];

  for (const p of products) {
    // The shape stockUnitsFor() reads: a package is its designs, anything else
    // is its own row. Built here rather than mapping a whole Product so the
    // query can stay four columns wide.
    const shaped: StockShape = {
      kind: p.kind as StockShape["kind"],
      stock: p.stock,
      items: (designs.get(p.id) ?? []).map((stock) => ({ stock })),
    };

    const units = stockUnitsFor(shaped);
    if (units.length === 0) continue; // nothing tracked — counts as neither
    if (units.some((n) => n > 0)) counts.inStock += 1;

    const o = outOfStockUnits(shaped);
    const l = lowStockUnits(shaped);
    counts.outUnits += o;
    counts.lowUnits += l;
    if (o > 0) {
      counts.outProducts += 1;
      out.push({ id: p.id, n: o, sortOrder: p.sortOrder });
    }
    if (l > 0) {
      counts.lowProducts += 1;
      low.push({ id: p.id, n: l, sortOrder: p.sortOrder });
    }
  }

  const rank = (a: { n: number; sortOrder: number }, b: { n: number; sortOrder: number }) =>
    b.n - a.n || b.sortOrder - a.sortOrder;

  return {
    out: out.sort(rank).map((r) => r.id),
    low: low.sort(rank).map((r) => r.id),
    counts,
  };
}
