"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAnonClient } from "@/lib/supabase/anon";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders, type OrdersPage } from "@/lib/data/orders";
import type { OrderStatusDb } from "@/lib/supabase/types";

/* ------------------------------ Place order ---------------------------- */

const placeOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(20),
  provinceCode: z.string().trim().min(1).nullable().optional(),
  addressLine: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  couponCode: z.string().trim().max(40).nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        note: z.string().max(200).nullable().optional(),
      }),
    )
    .min(1),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type PlaceOrderResult =
  | { ok: true; code: string; total: number }
  | { ok: false; error: string };

export async function placeOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  // Cookie client → the RPC (SECURITY DEFINER) sees auth.uid() and attaches the
  // order to the signed-in user; guests get a null user_id.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("place_order", {
    p_customer_name: v.customerName,
    p_customer_phone: v.customerPhone,
    p_province_code: v.provinceCode ?? null,
    p_address_line: v.addressLine ?? null,
    p_notes: v.notes ?? null,
    p_coupon_code: v.couponCode ?? null,
    p_items: v.items.map((i) => ({ product_id: i.productId, qty: i.qty, note: i.note ?? null })),
  });

  if (error) {
    console.error("[placeOrder]", error);
    return { ok: false, error: error.message };
  }

  const result = data as { code: string; total: number };
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true, code: result.code, total: result.total };
}

/* --------------------------- Update status (admin) --------------------- */

const STATUSES: OrderStatusDb[] = ["review", "accepted", "shipped", "delivered"];

export async function updateOrderStatusAction(
  code: string,
  status: OrderStatusDb,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!STATUSES.includes(status)) return { ok: false, error: "invalid_status" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("orders").update({ status }).eq("code", code);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/orders");
  return { ok: true };
}

/** Next page of the admin orders board (infinite scroll). */
export async function loadMoreOrdersAction(offset: number): Promise<OrdersPage> {
  await requireAdmin();
  return getAllOrders(offset);
}

/* ------------------------------ Track order ---------------------------- */

export interface TrackingItem {
  name_ar: string;
  name_en: string;
  qty: number;
  line_total: number;
}
export interface TrackingResult {
  code: string;
  status: OrderStatusDb;
  total: number;
  tracking: string | null;
  created_at: string;
  items: TrackingItem[];
  events: { status: OrderStatusDb; created_at: string }[];
}

export async function trackOrderAction(code: string): Promise<TrackingResult | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  // Public, PII-safe RPC — anon client is fine.
  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_order_tracking", { p_code: trimmed });
  if (error) {
    console.error("[trackOrder]", error);
    return null;
  }
  return (data as TrackingResult | null) ?? null;
}
