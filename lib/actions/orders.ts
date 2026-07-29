"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders, type OrdersPage } from "@/lib/data/orders";
import { mapOrder, type OrderRowWithItems } from "@/lib/data/mappers";
import { TAGS } from "@/lib/data/tags";
import {
  sendOrderTelegramNotification,
  sendOrderCancelledTelegramNotification,
} from "@/lib/telegram";
import type { OrderStatusDb } from "@/lib/supabase/types";
import type { Order } from "@/lib/products";

/* ------------------------------ Place order ---------------------------- */

const placeOrderSchema = z
  .object({
    customerName: z.string().trim().min(2).max(80),
    customerPhone: z.string().trim().min(6).max(20),
    // Province and a full address are required at checkout; the note is not.
    provinceCode: z.string().trim().min(1),
    addressLine: z.string().trim().min(3).max(200),
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
      .max(200)
      .optional()
      .default([]),
    // Custom design requests queued in the cart — folded into THIS order so a
    // mixed basket stays a single order (each carries its own uploaded artwork).
    customs: z
      .array(
        z.object({
          type: z.enum(["brooch", "sticker", "poster"]),
          waterproof: z.boolean().optional().default(false),
          description: z.string().trim().max(1000).optional().default(""),
          images: z.array(z.string().url().max(500)).min(1).max(100),
        }),
      )
      .max(50)
      .optional()
      .default([]),
  })
  // A basket must contain at least one product OR one custom request.
  .refine((v) => v.items.length > 0 || v.customs.length > 0, {
    message: "no_items",
    path: ["items"],
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
    // Only send p_customs when the cart actually has custom requests. A
    // products-only checkout then calls the 7-arg signature, which works
    // against BOTH the old and the merged place_order — so deploying this
    // before the merge SQL runs can never break a normal order.
    ...(v.customs.length > 0
      ? {
          p_customs: v.customs.map((c) => ({
            type: c.type,
            waterproof: c.waterproof,
            description: c.description || null,
            images: c.images,
          })),
        }
      : {}),
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
    addressLine: v.addressLine ?? null,
    notes: v.notes ?? null,
    total: result.total,
    itemCount:
      v.items.reduce((sum, i) => sum + i.qty, 0) +
      v.customs.reduce((sum, c) => sum + c.images.length, 0),
  });

  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true, code: result.code, total: result.total };
}

/* --------------------------- Custom requests ---------------------------- */

const customRequestSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(6).max(20),
  // Province and full address are strictly required at checkout.
  provinceCode: z.string().trim().min(1),
  addressLine: z.string().trim().min(3).max(200),
  type: z.enum(["brooch", "sticker", "poster"]),
  waterproof: z.boolean().optional().default(false),
  description: z.string().trim().max(1000).optional().default(""),
  // WebP artwork already uploaded to the public custom-artwork bucket; the
  // RPC re-validates the prefix and recomputes the price server-side.
  images: z.array(z.string().url().max(500)).min(1).max(100),
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

  await sendOrderTelegramNotification({
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    provinceCode: v.provinceCode ?? null,
    addressLine: v.addressLine ?? null,
    notes: v.description || null,
    total: result.total,
    itemCount: v.images.length,
  });

  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true, code: result.code, total: result.total };
}

/* --------------------------- Track order (guest) ----------------------- */

const trackOrderSchema = z.object({
  code: z.string().trim().min(3).max(40),
  phone: z.string().trim().min(4).max(25),
});

export type TrackOrderResult = { ok: true; order: Order } | { ok: false };

/**
 * Guest order lookup. The track_order() RPC (SECURITY DEFINER) returns the
 * order ONLY when the code AND the phone match, so a guessable code alone can
 * never surface someone else's order. Authenticated users never need this —
 * their history loads automatically from getUserOrders().
 */
export async function trackOrderAction(input: {
  code: string;
  phone: string;
}): Promise<TrackOrderResult> {
  const parsed = trackOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("track_order", {
    p_code: parsed.data.code,
    p_phone: parsed.data.phone,
  });
  if (error || !data) return { ok: false };

  return { ok: true, order: mapOrder(data as unknown as OrderRowWithItems) };
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
  revalidateTag(TAGS.sales, "max");
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

  // Snapshot the order BEFORE cancel_order() hard-deletes it, so the
  // cancellation alert can carry the full details. RLS scopes this read to the
  // buyer's own order, matching what cancel_order() enforces.
  const { data: snap } = await supabase
    .from("orders")
    .select(
      "code, customer_name, customer_phone, province_code, address_line, notes, total, is_custom, custom_images, order_items(qty)",
    )
    .eq("code", trimmed)
    .maybeSingle<{
      code: string;
      customer_name: string;
      customer_phone: string;
      province_code: string | null;
      address_line: string | null;
      notes: string | null;
      total: number;
      is_custom: boolean | null;
      custom_images: string[] | null;
      order_items: { qty: number }[] | null;
    }>();

  const { data, error } = await supabase.rpc("cancel_order", { p_code: trimmed });
  if (error) {
    console.error("[cancelOrder]", error);
    return { ok: false, error: error.message };
  }
  if (data !== true) return { ok: false, error: "cannot_cancel" };

  // Alert the store's bot that a customer cancelled (non-fatal — see place_order).
  if (snap) {
    const itemCount = snap.is_custom
      ? snap.custom_images?.length ?? 0
      : (snap.order_items ?? []).reduce((sum, i) => sum + (i.qty ?? 0), 0);
    await sendOrderCancelledTelegramNotification({
      code: snap.code,
      customerName: snap.customer_name,
      customerPhone: snap.customer_phone,
      provinceCode: snap.province_code ?? null,
      addressLine: snap.address_line ?? null,
      notes: snap.notes ?? null,
      total: snap.total,
      itemCount,
    });
  }

  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return { ok: true };
}

/**
 * Guest cancellation: a guest who tracked their order (code + phone) can cancel
 * it while it's still in review. cancel_order_guest() (SECURITY DEFINER) re-checks
 * the phone AND the review-only rule, hard-deletes the order, and returns a
 * snapshot — so we fire the SAME Telegram cancellation alert as the authed path.
 */
export async function cancelGuestOrderAction(input: {
  code: string;
  phone: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = trackOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_order_guest", {
    p_code: parsed.data.code,
    p_phone: parsed.data.phone,
  });
  if (error) {
    console.error("[cancelGuestOrder]", error);
    return { ok: false, error: error.message };
  }

  const res = data as {
    cancelled: boolean;
    reason?: string;
    order?: {
      code: string;
      customer_name: string;
      customer_phone: string;
      province_code: string | null;
      address_line: string | null;
      notes: string | null;
      total: number;
      is_custom: boolean;
      custom_images: string[] | null;
      item_qty: number;
    };
  } | null;

  if (!res || !res.cancelled) {
    return { ok: false, error: res?.reason === "cannot_cancel" ? "cannot_cancel" : "not_found" };
  }

  const o = res.order;
  if (o) {
    const itemCount = o.is_custom ? o.custom_images?.length ?? 0 : Number(o.item_qty ?? 0);
    await sendOrderCancelledTelegramNotification({
      code: o.code,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      provinceCode: o.province_code ?? null,
      addressLine: o.address_line ?? null,
      notes: o.notes ?? null,
      total: o.total,
      itemCount,
    });
  }

  revalidateTag(TAGS.sales, "max");
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
  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  return { ok: failed.length === 0, failed };
}
