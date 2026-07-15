import {
  tierUnitPrice,
  type Offer,
  type Product,
  type ProductItem,
} from "./products";

/**
 * Client-side mirror of the server pricing engine (place_order in 0012).
 * Used ONLY for display — the RPC recomputes everything at checkout, so the
 * client can never influence what is charged.
 *
 * Note: user-specific offers are visible here only for signed-in users
 * (RLS filters `offers` reads); guests still get them applied server-side.
 */

export interface LineSelection {
  item?: ProductItem | null;
  waterproof?: boolean;
}

export function liveFlashOffer(product: Pick<Product, "id">, offers: Offer[]): Offer | undefined {
  const now = Date.now();
  let best: Offer | undefined;
  for (const o of offers) {
    if (o.kind !== "flash" || o.productId !== product.id) continue;
    if (!o.endsAt || new Date(o.endsAt).getTime() <= now) continue;
    if (!best || (o.percent ?? 0) > (best.percent ?? 0)) best = o;
  }
  return best;
}

export function bundleOfferFor(product: Pick<Product, "id">, offers: Offer[]): Offer | undefined {
  let best: Offer | undefined;
  let bestRatio = 0;
  for (const o of offers) {
    if (o.kind !== "bundle" || o.productId !== product.id) continue;
    if (!o.buyQty || !o.freeQty) continue;
    const ratio = o.freeQty / (o.buyQty + o.freeQty);
    if (ratio > bestRatio) {
      best = o;
      bestRatio = ratio;
    }
  }
  return best;
}

/** Effective percent off for a product = better of its own discount vs live flash. */
export function percentOff(product: Product, offers: Offer[]): number {
  return Math.max(product.discountPercent, liveFlashOffer(product, offers)?.percent ?? 0);
}

/**
 * Unit price for one cart line, mirroring the server:
 *  base (tier / item / product) → minus percent-off → plus waterproof surcharge.
 */
export function unitPriceFor(
  product: Product,
  qty: number,
  sel: LineSelection,
  offers: Offer[],
): number {
  let unit =
    product.kind === "tiered"
      ? tierUnitPrice(product, qty)
      : sel.item?.price ?? product.price;

  const pct = percentOff(product, offers);
  if (pct > 0) unit = Math.floor((unit * (100 - pct)) / 100);

  if (sel.waterproof && product.waterproof) unit += product.waterproofSurcharge;
  return unit;
}

/** Bundle freebies for a quantity: floor(qty / (buy+free)) × free. */
export function freeUnitsFor(product: Product, qty: number, offers: Offer[]): number {
  const o = bundleOfferFor(product, offers);
  if (!o || !o.buyQty || !o.freeQty) return 0;
  return Math.floor(qty / (o.buyQty + o.freeQty)) * o.freeQty;
}

export interface LinePricing {
  unit: number;
  free: number;
  total: number;
}

export function linePricing(
  product: Product,
  qty: number,
  sel: LineSelection,
  offers: Offer[],
): LinePricing {
  const unit = unitPriceFor(product, qty, sel, offers);
  const free = freeUnitsFor(product, qty, offers);
  return { unit, free, total: unit * Math.max(qty - free, 0) };
}

/** Best conditional cart-percent discount for a subtotal (matches server). */
export function cartDiscountFor(
  subtotal: number,
  offers: Offer[],
): { amount: number; offer: Offer } | null {
  let best: Offer | null = null;
  for (const o of offers) {
    if (o.kind !== "cart_percent" || !o.percent) continue;
    if ((o.minCartTotal ?? 0) > subtotal) continue;
    if (!best || o.percent > (best.percent ?? 0)) best = o;
  }
  if (!best) return null;
  return { amount: Math.floor((subtotal * (best.percent ?? 0)) / 100), offer: best };
}

/** Cheapest matching delivery offer for a subtotal. */
export function deliveryOfferFor(subtotal: number, offers: Offer[]): Offer | null {
  let best: Offer | null = null;
  for (const o of offers) {
    if (o.kind !== "cart_delivery" || o.deliveryFee === null) continue;
    if ((o.minCartTotal ?? 0) > subtotal) continue;
    if (!best || (o.deliveryFee ?? 0) < (best.deliveryFee ?? 0)) best = o;
  }
  return best;
}

/** Product-page notes: every live offer touching this product. */
export function productOfferNotes(product: Product, offers: Offer[]): Offer[] {
  const flash = liveFlashOffer(product, offers);
  const bundle = bundleOfferFor(product, offers);
  return [flash, bundle].filter((o): o is Offer => !!o);
}
