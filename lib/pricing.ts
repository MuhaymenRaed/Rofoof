import {
  lowestBasePrice,
  tierUnitPrice,
  type Offer,
  type Product,
  type ProductItem,
  type VolumeTier,
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
  /** override base unit for volume-priced products (global by-count tier) */
  volumeUnit?: number;
}

/**
 * Global by-count unit price: the greatest tier whose minQty ≤ count wins; a
 * count below the smallest tier still gets the smallest tier's price. Returns
 * null when there is no ladder or nothing counted.
 */
export function volumeUnitPrice(count: number, tiers: VolumeTier[]): number | null {
  if (tiers.length === 0 || count <= 0) return null;
  let best: number | null = null;
  let bestMin = 0;
  for (const t of tiers) {
    if (t.minQty <= count && t.minQty >= bestMin) {
      best = t.unitPrice;
      bestMin = t.minQty;
    }
  }
  if (best === null) {
    const cheapestMin = [...tiers].sort((a, b) => a.minQty - b.minQty)[0];
    best = cheapestMin.unitPrice;
  }
  return best;
}

/** Cheapest rung of the volume ladder — used for "from X" display. */
export function cheapestVolumePrice(tiers: VolumeTier[]): number | null {
  return tiers.length > 0 ? Math.min(...tiers.map((t) => t.unitPrice)) : null;
}

/**
 * The best live flash offer on a product.
 *
 * `now` is a parameter rather than a `Date.now()` read because product cards
 * render while the page is being prerendered, where the clock is off limits.
 * Passing `null` means "don't second-guess the server's list" — the offers
 * snapshot is ISR-fresh, the same contract as every other price on the page —
 * and cards switch to a real timestamp on mount, so an offer that lapses during
 * the visit still drops off. Interactive paths omit it and get the clock.
 */
export function liveFlashOffer(
  product: Pick<Product, "id">,
  offers: Offer[],
  now: number | null = Date.now(),
): Offer | undefined {
  let best: Offer | undefined;
  for (const o of offers) {
    if (o.kind !== "flash" || o.productId !== product.id) continue;
    if (!o.endsAt) continue;
    if (now !== null && new Date(o.endsAt).getTime() <= now) continue;
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
export function percentOff(
  product: Product,
  offers: Offer[],
  now: number | null = Date.now(),
): number {
  return Math.max(product.discountPercent, liveFlashOffer(product, offers, now)?.percent ?? 0);
}

/**
 * Take a product's best money discount off an amount: percent (own discount or
 * a live flash offer, whichever is larger) vs its fixed IQD off — the cheaper
 * of the two wins, exactly like the server.
 */
export function applyProductDiscount(
  product: Product,
  amount: number,
  offers: Offer[],
  now: number | null = Date.now(),
): number {
  const pct = percentOff(product, offers, now);
  const afterPct = pct > 0 ? Math.floor((amount * (100 - pct)) / 100) : amount;
  const afterFixed =
    product.discountFixed > 0 ? Math.max(0, amount - product.discountFixed) : amount;
  return Math.min(afterPct, afterFixed);
}

/**
 * Unit price for one cart line, mirroring the server:
 *  base (tier / item / product) → plus waterproof surcharge → minus discount.
 *
 * The surcharge is part of what gets discounted, not something added back at
 * full price afterwards: a 2,000 sheet plus 1,000 waterproof at −50% is 1,500,
 * not 2,000. Same for every other add-on that moves the line's price.
 */
export function unitPriceFor(
  product: Product,
  qty: number,
  sel: LineSelection,
  offers: Offer[],
  now: number | null = Date.now(),
): number {
  // base: volume tier (if provided) → per-product tier → item/product price
  let unit =
    sel.volumeUnit != null
      ? sel.volumeUnit
      : product.kind === "tiered"
        ? tierUnitPrice(product, qty)
        : sel.item?.price ?? product.price;

  if (sel.waterproof && product.waterproof) unit += product.waterproofSurcharge;

  return applyProductDiscount(product, unit, offers, now);
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
  now: number | null = Date.now(),
): LinePricing {
  const unit = unitPriceFor(product, qty, sel, offers, now);
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

/* ------------------------------ Sale display ---------------------------- */

/** Everything a card / modal needs to advertise a product's discount. */
export interface DiscountView {
  /** the shopper really pays less than list — nothing below matters otherwise */
  active: boolean;
  /** list price before the discount (the struck-through number) */
  base: number;
  /** what they pay */
  price: number;
  /** whole percent off `base`, rounded — what the ribbon and the bar show */
  percent: number;
  /** IQD off a single piece */
  saved: number;
  /** the flash offer driving it, when one does — carries the countdown */
  flash?: Offer;
}

/**
 * The sale as a shopper sees it, from the product's cheapest rung. Unlike
 * `lowestPrice()` this folds in live flash offers, so a product on a timed
 * offer shows its real price on the card and not just in the quick view.
 */
export function discountView(
  product: Product,
  offers: Offer[],
  /** see `liveFlashOffer` — cards pass the store's mount-time clock */
  now: number | null,
): DiscountView {
  const base = lowestBasePrice(product);
  const price = applyProductDiscount(product, base, offers, now);
  const saved = base - price;
  const flash = liveFlashOffer(product, offers, now);
  return {
    active: saved > 0,
    base,
    price,
    // Derived from what's actually saved, so a fixed IQD discount advertises a
    // percentage too rather than showing nothing.
    percent: base > 0 ? Math.round((saved / base) * 100) : 0,
    saved,
    // Only when the timer is honest about the price: a bigger standing discount
    // outlives the flash, so its countdown would promise a rise that won't come.
    flash: flash && (flash.percent ?? 0) >= product.discountPercent ? flash : undefined,
  };
}

/** Product-page notes: every live offer touching this product. */
export function productOfferNotes(product: Product, offers: Offer[]): Offer[] {
  const flash = liveFlashOffer(product, offers);
  const bundle = bundleOfferFor(product, offers);
  return [flash, bundle].filter((o): o is Offer => !!o);
}
