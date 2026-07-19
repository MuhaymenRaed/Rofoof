"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders, type OrdersPage } from "@/lib/data/orders";
import { sendOrderTelegramNotification } from "@/lib/telegram";
import { sendCustomerOrderWhatsapp } from "@/lib/whatsapp";
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
        itemId: z.string().uuid().nullable().optional(),
        qty: z.number().int().min(1).max(99),
        waterproof: z.boolean().optional().default(false),
        customImageUrl: z.string().url().max(500).nullable().optional(),
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
    p_items: v.items.map((i) => ({
      product_id: i.productId,
      item_id: i.itemId ?? null,
      qty: i.qty,
      waterproof: i.waterproof,
      custom_image_url: i.customImageUrl ?? null,
      note: i.note ?? null,
    })),
  });

  if (error) {
    console.error("[placeOrder]", error);
    return { ok: false, error: error.message };
  }

  const result = data as { code: string; total: number };

  // Alert the store's Telegram bot. Fully non-fatal: sendOrderTelegramNotification
  // never throws, so a Telegram outage can never fail an already-successful
  // order. Still awaited (not fire-and-forget) — Netlify Functions can freeze
  // the function the instant this action's response is sent, which would
  // silently kill an un-awaited call before the request ever reaches Telegram.
  await sendOrderTelegramNotification({
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    provinceCode: v.provinceCode ?? null,
    total: result.total,
    itemCount: v.items.reduce((sum, i) => sum + i.qty, 0),
  });

  // Confirm to the CUSTOMER on WhatsApp from rofoof's official number (also
  // non-fatal, also awaited for the same serverless reason).
  await sendCustomerOrderWhatsapp({
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    provinceCode: v.provinceCode ?? null,
    total: result.total,
    itemCount: v.items.reduce((sum, i) => sum + i.qty, 0),
  });

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true, code: result.code, total: result.total };
}

/* --------------------------- Custom requests ---------------------------- */

const customRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(20),
  provinceCode: z.string().trim().min(1).nullable().optional(),
  addressLine: z.string().trim().max(200).nullable().optional(),
  type: z.enum(["brooch", "sticker", "poster"]),
  waterproof: z.boolean().optional().default(false),
  description: z.string().trim().max(1000).optional().default(""),
  // WebP artwork already uploaded to the public custom-artwork bucket; the
  // RPC re-validates the prefix and recomputes the price server-side.
  images: z.array(z.string().url().max(500)).min(1).max(20),
});

export type CustomRequestInput = z.input<typeof customRequestSchema>;

export async function placeCustomRequestAction(
  input: CustomRequestInput,
): Promise<PlaceOrderResult> {
  const parsed = customRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("place_custom_request", {
    p_customer_name: v.customerName,
    p_customer_phone: v.customerPhone,
    p_province_code: v.provinceCode ?? null,
    p_address_line: v.addressLine ?? null,
    p_type: v.type,
    p_waterproof: v.waterproof,
    p_description: v.description || null,
    p_images: v.images,
  });

  if (error) {
    console.error("[customRequest]", error);
    return { ok: false, error: error.message };
  }

  const result = data as { code: string; total: number };

  const notify = {
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    provinceCode: v.provinceCode ?? null,
    total: result.total,
    itemCount: v.images.length,
  };
  await sendOrderTelegramNotification(notify);
  await sendCustomerOrderWhatsapp(notify);

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

/* --------------------------- Cancel (customer) ------------------------- */

/**
 * Let a signed-in buyer cancel their OWN order while it's still in review
 * (not yet accepted). The cancel_order() RPC is SECURITY DEFINER and enforces
 * both ownership (user_id = auth.uid()) and the review-only rule server-side,
 * then hard-deletes the order (order_items cascade). Returns false if the
 * order can't be cancelled (wrong owner, already accepted, or gone).
 */
export async function cancelOrderAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_order", { p_code: trimmed });
  if (error) {
    console.error("[cancelOrder]", error);
    return { ok: false, error: error.message };
  }
  if (data !== true) return { ok: false, error: "cannot_cancel" };

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true };
}

/**
 * Bulk status move for the order-cards grid. Each entry carries its own target
 * status (computed client-side as next/previous step per card), validated here.
 */
export async function updateManyOrderStatusesAction(
  updates: { code: string; status: OrderStatusDb }[],
): Promise<{ ok: boolean; failed: string[] }> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const failed: string[] = [];

  for (const u of updates.slice(0, 100)) {
    if (!STATUSES.includes(u.status)) {
      failed.push(u.code);
      continue;
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: u.status })
      .eq("code", u.code);
    if (error) failed.push(u.code);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidatePath("/orders");
  return { ok: failed.length === 0, failed };
}
