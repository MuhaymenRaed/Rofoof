import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapOrder, type OrderRowWithItems } from "./mappers";
import type { Order } from "@/lib/products";

const ORDER_SELECT = "*, order_items(*)";

/** Orders belonging to a specific user (RLS also enforces ownership). */
export async function getUserOrders(userId: string): Promise<Order[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orders] getUserOrders:", error);
    return [];
  }
  return (data as unknown as OrderRowWithItems[]).map(mapOrder);
}

export interface OrdersPage {
  orders: Order[];
  hasMore: boolean;
}

/**
 * A page of every order (admin only — call requireAdmin() first; RLS also
 * gates this). Fetches `limit + 1` rows to detect `hasMore` without a
 * separate count query, then trims back to `limit`.
 */
export async function getAllOrders(offset = 0, limit = 40): Promise<OrdersPage> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit); // limit + 1 rows

  if (error) {
    console.error("[orders] getAllOrders:", error);
    return { orders: [], hasMore: false };
  }

  const rows = data as unknown as OrderRowWithItems[];
  const hasMore = rows.length > limit;
  return { orders: rows.slice(0, limit).map(mapOrder), hasMore };
}
