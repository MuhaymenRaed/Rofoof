import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapProduct, type ProductRowWithFandoms } from "./mappers";
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
  revenue: 0,
  revenue30d: 0,
  avgOrder: 0,
  topProducts: [],
};

export interface WeeklyRevenuePoint {
  day: string;
  value: number;
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
    .select("*, product_fandoms(fandom_code), product_categories(category_code)")
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
