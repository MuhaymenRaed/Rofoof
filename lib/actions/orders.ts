"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { ensureDeviceId } from "@/lib/device-id";
import {
  couponLimitBlock,
  recordCouponRedemption,
  releaseCouponRedemption,
} from "@/lib/coupon-guard";
import { getAllOrders, type OrdersPage } from "@/lib/data/orders";
import { mapOrder, type OrderRowWithItems } from "@/lib/data/mappers";
import { TAGS } from "@/lib/data/tags";
import {
  sendOrderTelegramNotification,
  sendOrderCancelledTelegramNotification,
} from "@/lib/telegram";
import type { OrderStatusDb } from "@/lib/supabase/types";
import type { Order } from "@/lib/products";

/**
 * The authoritative money breakdown for an order. Uses the admin client so it
 * resolves even for a guest order (whose rows a plain RLS read can't see), and
 * lets the Telegram alert show the true grand total (products − discount +
 * delivery) rather than a product-only figure.
 */
function calculateGrandTotal(
  subtotal: number,
  discountTotal: number,
  deliveryFee: number,
): number {
  return Math.max(subtotal - discountTotal, 0) + deliveryFee;
}

async function getOrderMoney(code: string): Promise<{
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  /** The code the DATABASE recorded against the order — see placeOrderAction. */
  couponCode: string | null;
} | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("orders")
      .select("subtotal, discount_total, delivery_fee, coupon_code")
      .eq("code", code)
      .maybeSingle();
    if (!data) return null;
    return {
      subtotal: data.subtotal ?? 0,
      discountTotal: data.discount_total ?? 0,
      deliveryFee: data.delivery_fee ?? 0,
      couponCode: data.coupon_code ?? null,
    };
  } catch {
    return null;
  }
}

/** Iraqi mobile in local form: 07 followed by 9 digits. */
const IRAQ_PHONE_RE = /^07\d{9}$/;

/** Minimum designs in a custom STICKER order — mirrors the request modal. */
const MIN_STICKER_IMAGES = 10;

/**
 * Ceiling on a hand-set price, matching the `manual_total` check constraint in
 * docs/admin-manual-pricing.sql. Both exist to keep a fat-fingered number from
 * overflowing the `int` columns the order totals are summed into.
 */
const MAX_MANUAL_PRICE = 100_000_000;

/* ------------------------------ Place order ---------------------------- */

const placeOrderSchema = z
  .object({
    customerName: z.string().trim().min(2).max(80),
    // An Iraqi mobile in local form (07XXXXXXXXX) — the same rule the checkout
    // enforces, repeated here so a crafted request can't store a junk number.
    customerPhone: z
      .string()
      .trim()
      .max(25)
      .refine((v) => IRAQ_PHONE_RE.test(v.replace(/\D/g, "")), "invalid_phone"),
    // Optional backup number; blank is fine, but a value must be a real one.
    customerPhone2: z
      .string()
      .trim()
      .max(25)
      .nullable()
      .optional()
      .refine(
        (v) => !v || IRAQ_PHONE_RE.test(v.replace(/\D/g, "")),
        "invalid_phone2",
      ),
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
        z
          .object({
            type: z.enum(["brooch", "sticker", "poster"]),
            waterproof: z.boolean().optional().default(false),
            description: z.string().trim().max(1000).optional().default(""),
            images: z.array(z.string().url().max(500)).min(1).max(100),
            // An exact price for the whole request, set by an admin. Accepted
            // here but NOT trusted here: place_order re-checks is_admin() and
            // raises `forbidden_manual_price` for anyone else, so this schema
            // only has to keep the value in range for an `int` column.
            manualTotal: z
              .number()
              .int()
              .min(0)
              .max(MAX_MANUAL_PRICE)
              .nullable()
              .optional(),
          })
          // Sticker runs are cut by the sheet, so they start at 10 designs.
          // Enforced here too — the modal blocks it, but a crafted request
          // must not be able to slip a 1-sticker order through.
          .refine(
            (c) =>
              c.type !== "sticker" || c.images.length >= MIN_STICKER_IMAGES,
            {
              message: "sticker_minimum",
              path: ["images"],
            },
          ),
      )
      .max(50)
      .optional()
      .default([]),
    // Admin-only manual lines: off-catalogue work described in free text and
    // priced by hand. Same note as above — the authority is place_order's
    // is_admin() check, which raises `forbidden_manual_order` otherwise.
    manuals: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(120),
          description: z.string().trim().max(1000).optional().default(""),
          price: z.number().int().min(0).max(MAX_MANUAL_PRICE),
        }),
      )
      .max(20)
      .optional()
      .default([]),
  })
  // A basket must contain at least one product, custom request or manual line.
  .refine(
    (v) => v.items.length > 0 || v.customs.length > 0 || v.manuals.length > 0,
    {
      message: "no_items",
      path: ["items"],
    },
  );

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type PlaceOrderResult =
  | {
      ok: true;
      code: string;
      total: number;
      /**
       * A hand-set price was asked for and the database quietly priced the
       * request the usual way instead, because docs/admin-manual-pricing.sql
       * hasn't been run. The order EXISTS and is fine — it is just billed at
       * the automatic price. Only ever true on the admin path, and surfaced so
       * an admin fixes the total rather than discovering it on the invoice.
       */
      manualPriceIgnored?: boolean;
    }
  | { ok: false; error: string };

/**
 * Did the order actually record the hand-set prices it was sent?
 *
 * Unknown JSON keys are ignored by a Postgres function, so a `manual_total`
 * sent to a pre-migration place_order is dropped without complaint — the one
 * way this feature could mislead rather than fail. This confirms it landed by
 * looking for the column on the rows just written: a missing column is
 * PostgREST's 42703, which is precisely "the migration hasn't run".
 *
 * Only called when a manual price was requested, so an ordinary checkout never
 * pays for this round trip. Any other failure answers "applied" — refusing to
 * cry wolf about an order that is very likely correct.
 */
async function manualPricesLanded(code: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("code, order_items(manual_total)")
      .eq("code", code)
      .maybeSingle<{ order_items: { manual_total: number | null }[] | null }>();
    if (error) return !isMissingColumnError(error);
    return (data?.order_items ?? []).some((i) => i.manual_total != null);
  } catch {
    return true;
  }
}

function isMissingColumnError(error: {
  code?: string;
  message?: string;
}): boolean {
  return error.code === "42703" || /manual_total/i.test(error.message ?? "");
}

export async function placeOrderAction(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const v = parsed.data;

  // Both admin-only extras ride inside the existing `p_customs` array rather
  // than a new RPC argument. That keeps place_order's signature — and therefore
  // its grants, and every ordinary customer checkout — completely untouched by
  // this feature. A manual line is just a custom entry of type 'manual'.
  const customPayload = [
    ...v.customs.map((c) => ({
      type: c.type,
      waterproof: c.waterproof,
      description: c.description || null,
      images: c.images,
      // Omitted entirely when unset, so a normal request is byte-for-byte the
      // payload it has always been.
      ...(c.manualTotal != null ? { manual_total: c.manualTotal } : {}),
    })),
    ...v.manuals.map((m) => ({
      type: "manual" as const,
      title: m.title,
      description: m.description || null,
      manual_total: m.price,
      // A manual line has no artwork. Sent as an empty array rather than
      // omitted only to keep every entry in this array the same shape.
      //
      // A pre-migration place_order rejects the unknown type outright with
      // `invalid_type`, which is the behaviour we want: the line fails loudly
      // instead of being dropped from a basket that then charges less.
      images: [] as string[],
    })),
  ];
  const wantsManualPrice =
    v.manuals.length > 0 || v.customs.some((c) => c.manualTotal != null);

  // Who this checkout counts as, for the coupon ledger: the account if there is
  // one, this browser either way, and the number being ordered under — the last
  // is the only key a customer can't shed by clearing their browser.
  const [deviceId, currentUser] = await Promise.all([
    ensureDeviceId(),
    getCurrentUser(),
  ]);
  const couponIdentity = {
    deviceId,
    userId: currentUser?.id ?? null,
    phone: v.customerPhone,
  };

  // The cart already checked this, but only against the device — the phone
  // arrives here. Refuse rather than quietly charging full price: the customer
  // is expecting the discount they can see on the screen in front of them.
  if (v.couponCode) {
    const block = await couponLimitBlock(v.couponCode, couponIdentity);
    if (block === "per_user_limit") return { ok: false, error: "coupon_used" };
    if (block) return { ok: false, error: "coupon_exhausted" };
  }

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
    // Only send p_customs when the cart actually has custom requests or manual
    // lines. A products-only checkout then calls the 7-arg signature, which
    // works against BOTH the old and the merged place_order — so deploying this
    // before the merge SQL runs can never break a normal order.
    ...(customPayload.length > 0 ? { p_customs: customPayload } : {}),
    // Same reasoning: only send the backup number when there IS one, so a
    // deploy that lands before the migration can't break an ordinary checkout.
    ...(v.customerPhone2 ? { p_customer_phone2: v.customerPhone2 } : {}),
  });

  if (error) {
    console.error("[placeOrder]", error);
    // place_order raises `out_of_stock:<name>` when a design ran out between
    // the cart being filled and the order landing. That's an ordinary race, not
    // a fault, so it gets its own code for the checkout to explain — the raw
    // Postgres string would be shown to the shopper otherwise.
    if (/coupon_per_user_limit/.test(error.message))
      return { ok: false, error: "coupon_used" };
    if (/coupon_usage_limit/.test(error.message))
      return { ok: false, error: "coupon_exhausted" };
    if (
      /coupon/i.test(error.message) &&
      /(limit|used|exhaust|redeem)/i.test(error.message)
    )
      return { ok: false, error: "coupon_used" };
    if (/out_of_stock/.test(error.message))
      return { ok: false, error: "out_of_stock" };
    // A non-admin session reached the admin-only pricing path. Distinct from a
    // generic failure because the fix is specific: sign in as an admin, or drop
    // the hand-priced line.
    if (
      /forbidden_manual|manual_price_required|invalid_manual_total/.test(
        error.message,
      )
    ) {
      return { ok: false, error: "manual_forbidden" };
    }
    // Only a MANUAL LINE can draw `invalid_type` — it is the one entry whose
    // type a pre-migration place_order doesn't recognise. Scoped to that case
    // rather than to manual pricing generally, so a genuinely malformed custom
    // request never gets reported as a missing migration.
    if (v.manuals.length > 0 && /invalid_type/.test(error.message)) {
      return { ok: false, error: "manual_unsupported" };
    }
    return { ok: false, error: error.message };
  }

  const result = data as { code: string; total: number };

  // The alert must show the amount the customer actually pays: products (after
  // discount) PLUS delivery. Read the authoritative breakdown with the admin
  // client (RLS would hide a *guest* order from a plain read) and fall back to
  // the RPC total if that read is unavailable.
  const money = await getOrderMoney(result.code);
  const grandTotal = money
    ? calculateGrandTotal(
        money.subtotal,
        money.discountTotal,
        money.deliveryFee,
      )
    : result.total;

  // Spend the code — but only on the database's own word that this order took
  // it. place_order() applies the BEST single money discount, so a cart offer
  // can beat the coupon and leave it unused; burning a customer's one-time code
  // for a discount they never got would be worse than not counting it at all.
  if (
    v.couponCode &&
    money?.couponCode?.toUpperCase() === v.couponCode.trim().toUpperCase() &&
    money.discountTotal > 0
  ) {
    await recordCouponRedemption(v.couponCode, couponIdentity, result.code);
  }

  // Alert the store's Telegram bot. Fully non-fatal: sendOrderTelegramNotification
  // never throws, so a Telegram outage can never fail an already-successful
  // order. Still awaited (not fire-and-forget) — Netlify Functions can freeze
  // the function the instant this action's response is sent, which would
  // silently kill an un-awaited call before the request ever reaches Telegram.
  await sendOrderTelegramNotification({
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    customerPhone2: v.customerPhone2 ?? null,
    provinceCode: v.provinceCode ?? null,
    addressLine: v.addressLine ?? null,
    notes: v.notes ?? null,
    total: grandTotal,
    subtotal: money?.subtotal,
    discountTotal: money?.discountTotal,
    deliveryFee: money?.deliveryFee ?? 0,
    itemCount:
      v.items.reduce((sum, i) => sum + i.qty, 0) +
      v.customs.reduce((sum, c) => sum + c.images.length, 0) +
      // One piece per manual line — it is a single job, however it is described.
      v.manuals.length,
  });

  // Only on the admin path, and only after the order is safely placed: confirm
  // the hand-set prices were actually stored (see manualPricesLanded).
  const manualPriceIgnored = wantsManualPrice
    ? !(await manualPricesLanded(result.code))
    : false;

  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/orders");
  return {
    ok: true,
    code: result.code,
    total: result.total,
    manualPriceIgnored,
  };
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

  // Same authoritative read as a normal checkout, so the alert can itemise
  // products / discount / delivery instead of only a bare total. The RPC's own
  // total stays authoritative here: a custom request is priced server-side, so
  // the breakdown is only shown when it reconciles with that total — otherwise
  // the alert falls back to the total alone rather than risk understating it.
  const money = await getOrderMoney(result.code);
  const itemised =
    money != null &&
    calculateGrandTotal(
      money.subtotal,
      money.discountTotal,
      money.deliveryFee,
    ) === result.total
      ? money
      : null;

  await sendOrderTelegramNotification({
    code: result.code,
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    provinceCode: v.provinceCode ?? null,
    addressLine: v.addressLine ?? null,
    notes: v.description || null,
    total: result.total,
    subtotal: itemised?.subtotal,
    discountTotal: itemised?.discountTotal,
    deliveryFee: itemised?.deliveryFee,
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

const STATUSES: OrderStatusDb[] = [
  "review",
  "accepted",
  "shipped",
  "delivered",
];

/**
 * Whether an order at this status is holding real pieces off the shelf.
 *
 * Stock moves when the admin ACCEPTS, not when the order is placed. An order
 * sitting in review is a request, and a shop full of unreviewed requests
 * shouldn't read as sold out; accepting is the moment the shop commits to
 * filling it. Everything past accepted is still committed, so it stays taken.
 */
function consumesStock(status: OrderStatusDb): boolean {
  return status !== "review";
}

/**
 * Take the order's pieces off the shelf, or put them back.
 *
 * Idempotent by way of `orders.stock_applied`: the RPC claims that flag with a
 * conditional update and only moves stock if the claim succeeded, so accepting
 * twice, a double-click, or a retry can never take the stock twice — and
 * bouncing accepted → review → accepted lands back where it started.
 *
 * Returns an error string to abort on, or null to carry on. A database without
 * the migration yet reports the function as missing, which is not a failure:
 * statuses keep moving exactly as they did before, stock just isn't tracked.
 */
async function moveOrderStock(
  code: string,
  apply: boolean,
): Promise<string | null> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("admin_set_order_stock", {
    p_code: code,
    p_apply: apply,
  });
  if (!error) return null;

  // Migration not applied yet — degrade to the old behaviour rather than
  // blocking the admin from working their orders board.
  if (
    error.code === "42883" ||
    /admin_set_order_stock|stock_applied/i.test(error.message)
  ) {
    console.warn(
      "[moveOrderStock] stock RPC missing — run docs/per-item-stock.sql",
    );
    return null;
  }
  if (/out_of_stock/i.test(error.message)) return "out_of_stock";
  console.error("[moveOrderStock]", error);
  return error.message;
}

export async function updateOrderStatusAction(
  code: string,
  status: OrderStatusDb,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!STATUSES.includes(status)) return { ok: false, error: "invalid_status" };

  // Take the stock BEFORE marking the order accepted, so an order that can't
  // actually be filled never gets a status saying it will be. Releasing runs
  // after the write instead — putting pieces back can't fail for lack of them.
  if (consumesStock(status)) {
    const stockErr = await moveOrderStock(code, true);
    if (stockErr) return { ok: false, error: stockErr };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("orders")
    .update({ status })
    .eq("code", code);
  if (error) return { ok: false, error: error.message };

  if (!consumesStock(status)) await moveOrderStock(code, false);

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  return { ok: true };
}

/** Next page of the admin orders board (infinite scroll). */
export async function loadMoreOrdersAction(
  offset: number,
): Promise<OrdersPage> {
  await requireAdmin();
  return getAllOrders(offset);
}

/* --------------------------- Cancel (customer) ------------------------- */

/**
 * Let a signed-in buyer cancel their OWN order while it's still in review
 * (not yet accepted). The cancel_order() RPC is SECURITY DEFINER and enforces
 * both ownership (user_id = auth.uid()) and the review-only rule server-side,
 * then removes the order from `orders` (items cascade; an AFTER DELETE
 * trigger archives it into cancelled_orders). Returns false if the
 * order can't be cancelled (wrong owner, already accepted, or gone).
 */
export async function cancelOrderAction(
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "invalid_input" };

  const supabase = await createSupabaseServerClient();

  // Snapshot the order BEFORE cancel_order() removes it, so the
  // cancellation alert can carry the full details. RLS scopes this read to the
  // buyer's own order, matching what cancel_order() enforces.
  const { data: snap } = await supabase
    .from("orders")
    .select(
      "code, customer_name, customer_phone, customer_phone2, province_code, address_line, notes, subtotal, discount_total, delivery_fee, is_custom, custom_images, order_items(qty)",
    )
    .eq("code", trimmed)
    .maybeSingle<{
      code: string;
      customer_name: string;
      customer_phone: string;
      customer_phone2: string | null;
      province_code: string | null;
      address_line: string | null;
      notes: string | null;
      subtotal: number;
      discount_total: number;
      delivery_fee: number;
      is_custom: boolean | null;
      custom_images: string[] | null;
      order_items: { qty: number }[] | null;
    }>();

  const { data, error } = await supabase.rpc("cancel_order", {
    p_code: trimmed,
  });
  if (error) {
    console.error("[cancelOrder]", error);
    return { ok: false, error: error.message };
  }
  if (data !== true) return { ok: false, error: "cannot_cancel" };

  // The order is gone, so the use it spent on a discount code goes back with
  // it — a one-per-customer code must not be left burnt on an order that no
  // longer exists.
  await releaseCouponRedemption(trimmed);

  // Alert the store's bot that a customer cancelled (non-fatal — see place_order).
  if (snap) {
    const itemCount = snap.is_custom
      ? (snap.custom_images?.length ?? 0)
      : (snap.order_items ?? []).reduce((sum, i) => sum + (i.qty ?? 0), 0);
    const deliveryFee = snap.delivery_fee ?? 0;
    const subtotal = snap.subtotal ?? 0;
    const discountTotal = snap.discount_total ?? 0;
    await sendOrderCancelledTelegramNotification({
      code: snap.code,
      customerName: snap.customer_name,
      customerPhone: snap.customer_phone,
      customerPhone2: snap.customer_phone2 ?? null,
      provinceCode: snap.province_code ?? null,
      addressLine: snap.address_line ?? null,
      notes: snap.notes ?? null,
      total: calculateGrandTotal(subtotal, discountTotal, deliveryFee),
      subtotal,
      discountTotal,
      deliveryFee,
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
 * the phone AND the review-only rule, removes the order (archived by trigger),
 * and returns a
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
      customer_phone2: string | null;
      province_code: string | null;
      address_line: string | null;
      notes: string | null;
      subtotal?: number;
      discount_total?: number;
      delivery_fee?: number;
      total: number;
      is_custom: boolean;
      custom_images: string[] | null;
      item_qty: number;
    };
  } | null;

  if (!res || !res.cancelled) {
    return {
      ok: false,
      error: res?.reason === "cannot_cancel" ? "cannot_cancel" : "not_found",
    };
  }

  const o = res.order;

  // Same as the signed-in path: the cancelled order releases its coupon use.
  // Prefer the code the RPC echoed back — the customer typed theirs, and it is
  // the stored spelling that the ledger is keyed on.
  await releaseCouponRedemption(o?.code ?? parsed.data.code);

  if (o) {
    const itemCount = o.is_custom
      ? (o.custom_images?.length ?? 0)
      : Number(o.item_qty ?? 0);
    const deliveryFee = o.delivery_fee ?? 0;
    const subtotal = o.subtotal ?? null;
    const discountTotal = o.discount_total ?? null;
    // Prefer the breakdown (products − discount + delivery); fall back to the
    // stored total if the RPC predates the extra snapshot fields.
    const total =
      subtotal != null && discountTotal != null
        ? calculateGrandTotal(subtotal, discountTotal, deliveryFee)
        : o.total;
    await sendOrderCancelledTelegramNotification({
      code: o.code,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      provinceCode: o.province_code ?? null,
      addressLine: o.address_line ?? null,
      notes: o.notes ?? null,
      total,
      subtotal: subtotal ?? undefined,
      discountTotal: discountTotal ?? undefined,
      deliveryFee,
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
 * Admin cancellation — the same procedure the buyer gets, but allowed at ANY
 * status (a customer can only cancel while the order is still in review).
 * Soft-deletes the order from `orders`, so items and the full row remain
 * recoverable while every normal list stops showing it.
 *
 * The row is NOT destroyed: an AFTER DELETE trigger copies it (and its items)
 * into cancelled_orders / cancelled_order_items, so the record survives in the
 * database while being invisible to the app. See archive-cancelled-orders.sql.
 *
 * Runs through the service-role client (gated by requireAdmin above it) so the
 * delete works regardless of how the orders RLS policies are scoped.
 */
export async function cancelOrderAdminAction(code: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  await requireAdmin();
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "invalid_input" };

  const admin = createAdminClient();

  // Snapshot before deleting so the alert can carry the full order.
  const { data: snap } = await admin
    .from("orders")
    .select(
      "code, customer_name, customer_phone, customer_phone2, province_code, address_line, notes, subtotal, discount_total, delivery_fee, is_custom, custom_images, order_items(qty)",
    )
    .eq("code", trimmed)
    .maybeSingle<{
      code: string;
      customer_name: string;
      customer_phone: string;
      customer_phone2: string | null;
      province_code: string | null;
      address_line: string | null;
      notes: string | null;
      subtotal: number;
      discount_total: number;
      delivery_fee: number;
      is_custom: boolean | null;
      custom_images: string[] | null;
      order_items: { qty: number }[] | null;
    }>();

  // Put the pieces back BEFORE the row goes: deleting an order cascades its
  // order_items, and those lines are the only record of what to give back.
  // This is the one cancel path that can reach an accepted order — a customer
  // may only cancel while still in review, where nothing was ever taken.
  // A no-op when the order never got past review, thanks to `stock_applied`.
  await moveOrderStock(trimmed, false);

  const { error } = await admin
    .from("orders")
    .update({ is_deleted: true })
    .eq("code", trimmed)
    .eq("is_deleted", false);
  if (error) {
    console.error("[cancelOrderAdmin]", error);
    // The order is still live and its stock has just been handed back — take
    // it again so the shelf matches the order that still exists.
    await moveOrderStock(trimmed, true);
    return { ok: false, error: error.message };
  }

  // The store cancelled it, not the customer — all the more reason to hand the
  // discount code back rather than leave them holding a spent one.
  await releaseCouponRedemption(trimmed);

  if (snap) {
    const itemCount = snap.is_custom
      ? (snap.custom_images?.length ?? 0)
      : (snap.order_items ?? []).reduce((sum, i) => sum + (i.qty ?? 0), 0);
    const deliveryFee = snap.delivery_fee ?? 0;
    await sendOrderCancelledTelegramNotification({
      code: snap.code,
      customerName: snap.customer_name,
      customerPhone: snap.customer_phone,
      customerPhone2: snap.customer_phone2 ?? null,
      provinceCode: snap.province_code ?? null,
      addressLine: snap.address_line ?? null,
      notes: snap.notes ?? null,
      total: calculateGrandTotal(
        snap.subtotal ?? 0,
        snap.discount_total ?? 0,
        deliveryFee,
      ),
      subtotal: snap.subtotal ?? 0,
      discountTotal: snap.discount_total ?? 0,
      deliveryFee,
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
    // Same order as the single-order path: claim the stock first when moving
    // into a committed status, so a card that can't be filled is reported as
    // failed instead of quietly being marked accepted.
    if (consumesStock(u.status)) {
      const stockErr = await moveOrderStock(u.code, true);
      if (stockErr) {
        failed.push(u.code);
        continue;
      }
    }
    const { error } = await supabase
      .from("orders")
      .update({ status: u.status })
      .eq("code", u.code);
    if (error) {
      failed.push(u.code);
      // The status didn't move, so don't leave its pieces held.
      if (consumesStock(u.status)) await moveOrderStock(u.code, false);
      continue;
    }
    if (!consumesStock(u.status)) await moveOrderStock(u.code, false);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard");
  revalidateTag(TAGS.sales, "max");
  revalidatePath("/orders");
  return { ok: failed.length === 0, failed };
}
