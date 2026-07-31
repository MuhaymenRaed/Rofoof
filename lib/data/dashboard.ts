import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapProduct, PRODUCT_SELECT, type ProductRowWithFandoms } from "./mappers";
import type { Product, OrderStatus } from "@/lib/products";

export interface TopProduct {
  id: string;
  nameAr: string;
  nameEn: string;
  sold: number;
  revenue: number;
}

export interface DashboardStats {
  inStock: number;
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  onDiscount: number;
  newUsers: number;
  totalCustomers: number;
  activeOrders: number;
  deliveredOrders: number;
  totalOrders: number;
  customOrders: number;
  customRevenue: number;
  revenue: number;
  revenue30d: number;
  avgOrder: number;
  topProducts: TopProduct[];
}

const EMPTY_STATS: DashboardStats = {
  inStock: 0,
  totalProducts: 0,
  lowStock: 0,
  outOfStock: 0,
  onDiscount: 0,
  newUsers: 0,
  totalCustomers: 0,
  activeOrders: 0,
  deliveredOrders: 0,
  totalOrders: 0,
  customOrders: 0,
  customRevenue: 0,
  revenue: 0,
  revenue30d: 0,
  avgOrder: 0,
  topProducts: [],
};

export interface WeeklyRevenuePoint {
  day: string;
  value: number;
}

/** Revenue split into what was earned on goods vs. what was collected for shipping. */
export interface RevenueSplit {
  /** Goods only: Σ max(subtotal − discount_total, 0) — discounts applied, delivery excluded. */
  products: number;
  /** Delivery fees collected. */
  delivery: number;
  /** products + delivery — what customers actually paid. */
  gross: number;
}

const EMPTY_SPLIT: RevenueSplit = { products: 0, delivery: 0, gross: 0 };

/**
 * All-time revenue split, summed from the money columns the order card itemises
 * (products − discount + delivery) rather than the stored `total`.
 *
 * Its own query because dashboard_stats() only exposes one combined revenue
 * figure; keeping both halves in a single pass means the products/delivery
 * breakdown is always internally consistent. Cancellations delete the order
 * row, so every row here is a live order.
 */
export async function getRevenueSplit(): Promise<RevenueSplit> {
  const supabase = await createSupabaseServerClient();
  const PAGE = 1000;
  const MAX_PAGES = 50; // 50k orders; guards against an unbounded loop
  let products = 0;
  let delivery = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE;
    const { data, error } = await supabase
      .from("orders")
      .select("subtotal, discount_total, delivery_fee")
      .order("id") // stable key so paging can't repeat or skip rows
      .range(from, from + PAGE - 1);

    if (error) {
      console.error("[dashboard] revenueSplit:", error);
      return page === 0 ? EMPTY_SPLIT : { products, delivery, gross: products + delivery };
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      products += Math.max(Number(row.subtotal ?? 0) - Number(row.discount_total ?? 0), 0);
      delivery += Number(row.delivery_fee ?? 0);
    }
    if (data.length < PAGE) break;
  }

  return { products, delivery, gross: products + delivery };
}

export interface DashboardCustomer {
  id: string;
  name: string;
  phone: string;
  provinceCode: string | null;
  address: string | null;
  status: OrderStatus;
  orders: number;
}

/** KPI cards — aggregated in one round-trip via the dashboard_stats() RPC. */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("dashboard_stats");
  if (error || !data) {
    console.error("[dashboard] stats:", error);
    return EMPTY_STATS;
  }
  const d = data as Record<string, unknown>;
  const n = (key: string) => Number(d[key] ?? 0);
  const top = Array.isArray(d.top_products) ? (d.top_products as Record<string, unknown>[]) : [];
  return {
    inStock: n("in_stock"),
    totalProducts: n("total_products"),
    lowStock: n("low_stock"),
    outOfStock: n("out_of_stock"),
    onDiscount: n("on_discount"),
    newUsers: n("new_users"),
    totalCustomers: n("total_customers"),
    activeOrders: n("active_orders"),
    deliveredOrders: n("delivered_orders"),
    totalOrders: n("total_orders"),
    customOrders: n("custom_orders"),
    customRevenue: n("custom_revenue"),
    revenue: n("revenue"),
    revenue30d: n("revenue_30d"),
    avgOrder: n("avg_order"),
    topProducts: top.map((t) => ({
      id: String(t.id ?? ""),
      nameAr: String(t.name_ar ?? ""),
      nameEn: String(t.name_en ?? ""),
      sold: Number(t.sold ?? 0),
      revenue: Number(t.revenue ?? 0),
    })),
  };
}

/** Orders per status — feeds the distribution pie chart. */
export async function getStatusCounts(): Promise<Record<OrderStatus, number>> {
  const supabase = await createSupabaseServerClient();
  const counts: Record<OrderStatus, number> = { review: 0, accepted: 0, shipped: 0, delivered: 0 };
  const { data, error } = await supabase.from("orders").select("status").limit(2000);
  if (error || !data) {
    console.error("[dashboard] statusCounts:", error);
    return counts;
  }
  for (const row of data) {
    const s = row.status as OrderStatus;
    if (s in counts) counts[s] += 1;
  }
  return counts;
}

/** Last 7 days of revenue for the bar chart. */
export async function getWeeklyRevenue(): Promise<WeeklyRevenuePoint[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("daily_revenue")
    .select("day, revenue")
    .order("day", { ascending: false })
    .limit(7);

  if (error || !data) {
    console.error("[dashboard] weeklyRevenue:", error);
    return [];
  }

  return data
    .filter((r) => r.day)
    .reverse()
    .map((r) => ({
      day: new Date(`${r.day}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" }),
      value: Number(r.revenue ?? 0),
    }));
}

/* ------------------------- Ranged (date) metrics ------------------------ */

/** How the picked period is sliced for the chart. */
export type RangeGrain = "day" | "month" | "year";

export interface RangePoint {
  label: string;
  value: number;
}

export interface RangeStats {
  revenue: number;
  /** Goods only for this period — discounts applied, delivery excluded. */
  productRevenue: number;
  /** Delivery fees collected in this period. */
  deliveryRevenue: number;
  orders: number;
  avgOrder: number;
  delivered: number;
  customOrders: number;
  customRevenue: number;
  series: RangePoint[];
}

const EMPTY_RANGE: RangeStats = {
  revenue: 0,
  productRevenue: 0,
  deliveryRevenue: 0,
  orders: 0,
  avgOrder: 0,
  delivered: 0,
  customOrders: 0,
  customRevenue: 0,
  series: [],
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Pre-seed every bucket of the period so gaps render as zero, not missing. */
function emptyBuckets(from: Date, grain: RangeGrain): Map<string, number> {
  const buckets = new Map<string, number>();
  if (grain === "day") {
    for (let h = 0; h < 24; h++) buckets.set(String(h).padStart(2, "0"), 0);
  } else if (grain === "month") {
    const days = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) buckets.set(String(d), 0);
  } else {
    for (const m of MONTHS_SHORT) buckets.set(m, 0);
  }
  return buckets;
}

function bucketKey(date: Date, grain: RangeGrain): string {
  if (grain === "day") return String(date.getHours()).padStart(2, "0");
  if (grain === "month") return String(date.getDate());
  return MONTHS_SHORT[date.getMonth()];
}

/**
 * Order metrics for an arbitrary window, sliced one grain finer than the
 * period (a day by hour, a month by day, a year by month). Computed from the
 * orders table directly so no extra RPC/migration is needed.
 */
export async function getRangeStats(
  fromIso: string,
  toIso: string,
  grain: RangeGrain,
): Promise<RangeStats> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("total, subtotal, discount_total, delivery_fee, status, is_custom, created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .limit(5000);

  if (error || !data) {
    console.error("[dashboard] rangeStats:", error);
    return EMPTY_RANGE;
  }

  const buckets = emptyBuckets(new Date(fromIso), grain);
  let revenue = 0;
  let productRevenue = 0;
  let deliveryRevenue = 0;
  let delivered = 0;
  let customOrders = 0;
  let customRevenue = 0;

  for (const row of data) {
    const total = Number(row.total ?? 0);
    revenue += total;
    productRevenue += Math.max(Number(row.subtotal ?? 0) - Number(row.discount_total ?? 0), 0);
    deliveryRevenue += Number(row.delivery_fee ?? 0);
    if (row.status === "delivered") delivered += 1;
    if (row.is_custom) {
      customOrders += 1;
      customRevenue += total;
    }
    const key = bucketKey(new Date(row.created_at), grain);
    buckets.set(key, (buckets.get(key) ?? 0) + total);
  }

  const orders = data.length;
  return {
    revenue,
    productRevenue,
    deliveryRevenue,
    orders,
    avgOrder: orders > 0 ? Math.round(revenue / orders) : 0,
    delivered,
    customOrders,
    customRevenue,
    series: [...buckets].map(([label, value]) => ({ label, value })),
  };
}

export interface InventoryPage {
  products: Product[];
  hasMore: boolean;
}

/**
 * A page of products (including inactive) for inventory management. Fetches
 * `limit + 1` rows to detect `hasMore` without a separate count query.
 */
export async function getInventory(offset = 0, limit = 30): Promise<InventoryPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("is_deleted", false) // deleted products are soft-deleted; never list them
    .order("sort_order", { ascending: false })
    .range(offset, offset + limit);

  if (error || !data) {
    console.error("[dashboard] inventory:", error);
    return { products: [], hasMore: false };
  }
  const rows = data as unknown as ProductRowWithFandoms[];
  const hasMore = rows.length > limit;
  return { products: rows.slice(0, limit).map(mapProduct), hasMore };
}

export interface CustomersPage {
  customers: DashboardCustomer[];
  hasMore: boolean;
}

interface AdminCustomerRow {
  id: string;
  name: string;
  phone: string;
  province_code: string | null;
  address: string | null;
  status: OrderStatus;
  orders: number;
}

/**
 * A page of customers derived from orders (guests + registered), via
 * admin_customers(). Fetches `limit + 1` rows to detect `hasMore`.
 */
export async function getCustomers(offset = 0, limit = 30): Promise<CustomersPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_customers", {
    p_limit: limit + 1,
    p_offset: offset,
  });
  if (error || !data) {
    console.error("[dashboard] customers:", error);
    return { customers: [], hasMore: false };
  }
  const rows = data as unknown as AdminCustomerRow[];
  const hasMore = rows.length > limit;
  return {
    customers: rows.slice(0, limit).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      provinceCode: r.province_code,
      address: r.address,
      status: r.status,
      orders: r.orders,
    })),
    hasMore,
  };
}
