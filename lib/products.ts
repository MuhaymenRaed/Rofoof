import type { DictKey } from "./i18n";

/** Category codes are dynamic — admins can create new ones in the dashboard. */
export type Category = string;
/** Fandom codes are dynamic too (gaming/anime/… + admin-created). */
export type Fandom = string;
export type Badge = "bestseller" | "new" | "waterproof";

/** A category row from the DB (bilingual, drives chips + filters). */
export interface CategoryInfo {
  code: string;
  nameAr: string;
  nameEn: string;
  icon: string;
}

/** A fandom row from the DB (bilingual, drives the store filter). */
export interface FandomInfo {
  code: string;
  nameAr: string;
  nameEn: string;
}

/**
 * How the product behaves in the store:
 *  - standard: images are angles of ONE product; single price (Minecraft medals)
 *  - package:  images are DISTINCT items the buyer picks from, each with its
 *              own optional price (stickers / posters / brooches)
 *  - tiered:   unit price depends on quantity via price tiers (disk medals)
 */
export type ProductKind = "standard" | "package" | "tiered";

/** One selectable item inside a package product. */
export interface ProductItem {
  id: string;
  imageUrl: string;
  nameAr: string;
  nameEn: string;
  /** null → inherits the parent product's price */
  price: number | null;
}

/** "min_qty and above → this unit price". */
export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

/** A rung of the GLOBAL by-count volume ladder (shared across all products). */
export interface VolumeTier {
  minQty: number;
  unitPrice: number;
}

/** Store-wide config: delivery fees + the landing-page stat numbers. */
export interface SiteSettings {
  deliveryFeeDefault: number;
  deliveryFeeKarbala: number;
  statFollowers: string;
  statProducts: string;
  statRating: string;
}

/** Province-aware delivery fee (Karbala is cheaper); mirrors place_order(). */
export function deliveryFeeFor(provinceCode: string | null | undefined, s: SiteSettings): number {
  return provinceCode === "karbala" ? s.deliveryFeeKarbala : s.deliveryFeeDefault;
}

export type OfferKind = "bundle" | "cart_percent" | "cart_delivery" | "flash";

/** A live promotion from the offers engine (RLS already filtered to live ones). */
export interface Offer {
  id: string;
  kind: OfferKind;
  titleAr: string;
  titleEn: string;
  productId: string | null;
  buyQty: number | null;
  freeQty: number | null;
  minCartTotal: number | null;
  percent: number | null;
  deliveryFee: number | null;
  endsAt: string | null;
}

export interface Product {
  id: string;
  nameAr: string;
  nameEn: string;
  /** short bilingual sub label shown under the title */
  subAr: string;
  subEn: string;
  price: number;
  emoji: string;
  /** cover image (= images[0]). Falls back to emoji when empty. */
  image?: string;
  /** all product images (Supabase Storage / CDN), ordered; first is the cover. */
  images: string[];
  /** accent color — backgrounds/pills are derived from it via color-mix */
  color: string;
  /** primary category (= categories[0]) — kept for compatibility */
  category: Category;
  /** all category codes the product belongs to */
  categories: string[];
  fandoms: Fandom[];
  badge?: Badge;
  waterproof?: boolean;
  /** extra IQD per unit when the buyer selects the waterproof variant */
  waterproofSurcharge: number;
  /** posters: buyer may upload their own artwork for printing */
  allowCustomImage: boolean;
  /** behavior selector — see ProductKind */
  kind: ProductKind;
  /** package contents (kind === "package"); ordered */
  items: ProductItem[];
  /** volume-pricing ladder (kind === "tiered"); ascending minQty */
  tiers: PriceTier[];
  soldOut?: boolean;
  /** admin/inventory only — whether the product is visible in the storefront */
  isActive?: boolean;
  /** admin/inventory only — units in stock */
  stock?: number;
  /** 0–90; > 0 shows the sale UI and is charged server-side at checkout */
  discountPercent: number;
  /** fixed IQD off (alternative to discountPercent; the better of the two wins) */
  discountFixed: number;
  /** priced by the GLOBAL volume ladder based on total count across the order */
  volumePriced: boolean;
  /** for "newest" sorting & the "Just landed" rail (higher = newer) */
  order: number;
  descAr: string;
  descEn: string;
  tags: string[];
}

/* ------------------------------ Pricing --------------------------------- */
/** The price actually charged — best (lowest) of percent-off vs fixed-off. */
export function effectivePrice(
  p: Pick<Product, "price" | "discountPercent" | "discountFixed">,
): number {
  const afterPct =
    p.discountPercent > 0 ? Math.floor((p.price * (100 - p.discountPercent)) / 100) : p.price;
  const afterFixed = p.discountFixed > 0 ? Math.max(0, p.price - p.discountFixed) : p.price;
  return Math.min(afterPct, afterFixed);
}

/** Base tier unit price for a quantity (greatest minQty ≤ qty wins). */
export function tierUnitPrice(p: Pick<Product, "price" | "tiers">, qty: number): number {
  let best: number | null = null;
  let bestMin = 0;
  for (const t of p.tiers) {
    if (t.minQty <= qty && t.minQty >= bestMin) {
      best = t.unitPrice;
      bestMin = t.minQty;
    }
  }
  return best ?? p.price;
}

/** The lowest price a product can be bought at — used for "from X" display. */
export function lowestPrice(p: Product): number {
  if (p.kind === "tiered" && p.tiers.length > 0) {
    const base = Math.min(...p.tiers.map((t) => t.unitPrice));
    return p.discountPercent > 0 ? Math.floor((base * (100 - p.discountPercent)) / 100) : base;
  }
  if (p.kind === "package" && p.items.length > 0) {
    const base = Math.min(...p.items.map((i) => i.price ?? p.price));
    return p.discountPercent > 0 ? Math.floor((base * (100 - p.discountPercent)) / 100) : base;
  }
  return effectivePrice(p);
}

/** Whether a package/tiered product has per-variant prices (show "from"). */
export function hasVariablePrice(p: Product): boolean {
  if (p.kind === "tiered") return p.tiers.length > 1;
  if (p.kind === "package") return p.items.some((i) => i.price !== null && i.price !== p.price);
  return false;
}

export const MAX_PRICE = 25000;

/** Category codes that can be waterproof (paper/vinyl products). */
export const WATERPROOF_CATEGORIES = ["stickers", "posters"];
export function canBeWaterproof(categoryCodes: string[]): boolean {
  return categoryCodes.some((c) => WATERPROOF_CATEGORIES.includes(c));
}

/* --------------------------- Custom requests ---------------------------- */
export type CustomType = "brooch" | "sticker" | "poster";

/** Per-type unit pricing for custom requests (mirrors custom_pricing table). */
export interface CustomPricing {
  kind: CustomType;
  unitPrice: number;
  waterproofExtra: number;
}

/**
 * A custom design request waiting in the cart. Artwork is already uploaded to
 * the custom-artwork bucket (as WebP); `unitPrice` is a display-only estimate —
 * place_custom_request() re-prices from custom_pricing at checkout.
 */
export interface CustomCartRequest {
  /** client-generated id, only used to key/remove the line */
  id: string;
  type: CustomType;
  images: string[];
  description: string;
  waterproof: boolean;
  unitPrice: number;
}

/** Distinct accent for custom requests everywhere (lists, badges, stats). */
export const CUSTOM_ORDER_COLOR = "#d946ef";

export const CUSTOM_TYPE_LABEL: Record<CustomType, { ar: string; en: string }> = {
  brooch: { ar: "بروش", en: "Brooch" },
  sticker: { ar: "ستكر", en: "Sticker" },
  poster: { ar: "بوستر", en: "Poster" },
};

/* ------------------------------- Orders -------------------------------- */
export type OrderStatus = "review" | "accepted" | "shipped" | "delivered";

export interface OrderItem {
  productId: string;
  qty: number;
  /** bundle freebies included in qty but not charged */
  freeQty: number;
  unitPrice: number;
  lineTotal: number;
  nameAr: string;
  nameEn: string;
  itemNameAr?: string;
  itemNameEn?: string;
  waterproof: boolean;
  customImageUrl?: string;
  note?: string;
}

export interface Order {
  code: string;
  date: string;
  tracking?: string;
  status: OrderStatus;
  customer: string;
  phone: string;
  provinceCode?: string;
  addressLine?: string;
  notes?: string;
  offerNote?: string;
  items: OrderItem[];
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  total: number;
  /** custom design request (brooch/sticker/poster) — styled distinctly */
  isCustom: boolean;
  customType?: CustomType;
  customImages: string[];
  customWaterproof: boolean;
}

/** Map an order status to the active tracker step index (0..3). */
export const statusStep: Record<OrderStatus, number> = {
  review: 0,
  accepted: 1,
  shipped: 2,
  delivered: 3,
};

export const statusStyle: Record<OrderStatus, { key: DictKey; color: string }> = {
  review: { key: "status.review", color: "#f59e0b" },
  accepted: { key: "status.accepted", color: "#8b5cf6" },
  shipped: { key: "status.shipped", color: "#0ea5a4" },
  delivered: { key: "status.delivered", color: "#22c55e" },
};
