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
 * A second-level taxonomy nested under a category (Video Games → PS5, PC…).
 * Admin-managed like categories/fandoms, and drives the third store filter.
 */
export interface SubcategoryInfo {
  code: string;
  /** parent category code */
  categoryCode: string;
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
  /**
   * Units left of THIS design, or null when the column isn't in the database
   * yet. null means "not tracked", never "none left": schema and code land at
   * different times here, so mapping an absent column to 0 would read as sold
   * out and grey out every design in the shop the moment this deployed ahead of
   * its migration. Unknown has to fail open.
   */
  stock: number | null;
}

/** Units left of a design, treating "not tracked" as freely available. */
export function itemInStock(item: Pick<ProductItem, "stock">): boolean {
  return item.stock === null || item.stock > 0;
}

/**
 * The most of one thing a shopper may hold: the count left of the exact design
 * they picked, or of the product itself when it isn't a package.
 *
 * null means "no ceiling" — either the stock column isn't there yet, or the
 * design has already run out, in which case the line is refused outright rather
 * than clamped to zero. Clamping to zero would delete a line out from under
 * someone mid-edit; letting checkout name the reason is kinder and clearer.
 */
export function stockCeilingFor(
  product: Pick<Product, "items"> | undefined,
  itemId?: string,
): number | null {
  if (!product) return null;
  const stock = itemId
    ? product.items.find((i) => i.id === itemId)?.stock
    : (product as Product).stock;
  return stock != null && stock > 0 ? stock : null;
}

/**
 * Under this many pieces, a product is flagged as running low — in the
 * inventory list and in the dashboard's KPI card, from this one definition.
 * It used to live inside dashboard_stats() where nothing could see it.
 *
 * Named "below" and compared with `<`, so the boundary can't drift: 4 is low,
 * 5 is not. Zero is counted as out of stock, not low, at both call sites.
 */
export const LOW_STOCK_BELOW = 5;

/**
 * Pieces on the shelf for a whole product: a package counts its designs, and
 * anything else counts itself.
 *
 * This is the number that matters now, and it's why the dashboard's stock KPIs
 * are worked out in the app rather than read from dashboard_stats(). That RPC
 * predates per-design stock, so it can only be reading products.stock — a
 * column that means nothing for a package. Every order taken drags a package's
 * own stock down while its designs stay full, so packages drift into the
 * "out of stock" count and sit there. No amount of resetting the data fixes
 * that; the sum is the only honest figure.
 *
 * null means not tracked (the column isn't there yet) — never zero.
 */
export function totalStockFor(p: Product): number | null {
  if (p.kind === "package" && p.items.length > 0) {
    const counted = p.items.filter((i) => i.stock != null);
    if (counted.length === 0) return null;
    return counted.reduce((sum, i) => sum + (i.stock ?? 0), 0);
  }
  return p.stock ?? null;
}

/**
 * Whether a package has anything left to sell. A package is only sold out once
 * every one of its designs is — a single design running out must not take the
 * whole product off the shelf.
 */
export function packageSoldOut(p: Pick<Product, "kind" | "items">): boolean {
  if (p.kind !== "package" || p.items.length === 0) return false;
  return p.items.every((i) => !itemInStock(i));
}

/**
 * Whether a product is out of stock, from the count rather than the flag.
 *
 * `products.sold_out` is written by the DATABASE when stock reaches zero and is
 * never cleared when stock comes back. Nothing in this app writes it — the
 * editor has no control for it and upsertProductAction doesn't touch it — so
 * once it was set there was no way to unset it: restocking a product to 5 left
 * it greyed out and unbuyable with "5" showing on it.
 *
 * The count is the thing the admin actually controls, so the count decides.
 * A tracked stock therefore overrides the flag entirely, and marking something
 * unavailable by hand is done by setting its stock to 0 — one number, one
 * meaning. The flag is still honoured for anything with no count at all.
 */
export function isSoldOut(p: Product): boolean {
  // A package is its designs; the row's own stock and flag say nothing about it.
  if (p.kind === "package" && p.items.length > 0) return packageSoldOut(p);
  if (p.stock != null) return p.stock <= 0;
  return p.soldOut ?? false;
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
  /** admin switch for the delivery banner under the home-page hero */
  deliveryNoticeActive: boolean;
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
  /** subcategory codes (second-level taxonomy under the categories) */
  subcategories: string[];
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
  /** admin-curated: shown in the homepage "featured picks" showcase section */
  isFeatured: boolean;
  /** admin's curated ordering (higher = shown first) */
  order: number;
  /** ISO timestamp the row was created — drives the real "Just landed" rail */
  createdAt: string;
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

/**
 * The list price a product starts from BEFORE any discount — the cheapest rung
 * for tiered/package products. This is the number a sale strikes through.
 */
export function lowestBasePrice(p: Product): number {
  if (p.kind === "tiered" && p.tiers.length > 0) {
    return Math.min(...p.tiers.map((t) => t.unitPrice));
  }
  if (p.kind === "package" && p.items.length > 0) {
    return Math.min(...p.items.map((i) => i.price ?? p.price));
  }
  return p.price;
}

/**
 * The lowest price a product can be bought at — used for "from X" display.
 * Offer-blind on purpose: this is what the store's price filter and sort read,
 * so it stays a pure function of the row. Cards go through `discountView()`,
 * which also folds in live flash offers.
 */
export function lowestPrice(p: Product): number {
  const base = lowestBasePrice(p);
  return effectivePrice({ ...p, price: base });
}

/** Whether a package/tiered product has per-variant prices (show "from"). */
export function hasVariablePrice(p: Product): boolean {
  if (p.kind === "tiered") return p.tiers.length > 1;
  if (p.kind === "package") return p.items.some((i) => i.price !== null && i.price !== p.price);
  return false;
}

export const MAX_PRICE = 100000;
/** Lowest value the store's price slider (and the ?maxPrice= param) allows. */
export const MIN_PRICE = 1000;
/**
 * Where the store's price slider sits before the shopper touches it — the top
 * of the range, so nothing is ever hidden until they choose to narrow it. Also
 * the value omitted from the URL as "no price filter chosen".
 */
export const DEFAULT_MAX_PRICE = MAX_PRICE;

/**
 * An admin-made showcase rail on the home page. Any number of them can exist;
 * each renders as its own titled row between "most ordered" and "just landed",
 * ordered by `order`. A product may belong to several groups at once.
 */
export interface FeaturedGroup {
  id: string;
  nameAr: string;
  nameEn: string;
  /** admin's manual ordering (lower = higher up the page) */
  order: number;
  /** ids of the products in this group, in the admin's order */
  productIds: string[];
  /** what the rail's "show all" button filters the store by (null = no button) */
  linkScope: FeaturedLinkScope | null;
  /** the chosen filter codes — several are OR-ed, exactly like the store page */
  linkValues: string[];
}

/** Which store filter a rail's "show all" button targets. */
export type FeaturedLinkScope = "category" | "subcategory" | "fandom";

/**
 * The store URL a rail's "show all" button points at, or undefined when the
 * admin hasn't chosen a target (in which case no button is rendered).
 * Mirrors the query keys the store page reads.
 */
export function featuredGroupHref(group: {
  linkScope: FeaturedLinkScope | null;
  linkValues: string[];
}): string | undefined {
  if (!group.linkScope || group.linkValues.length === 0) return undefined;
  // Comma-separated is how the store reads a multi-select group, and commas are
  // legal unescaped in a query value — so the link stays readable when shared.
  return `/store?${group.linkScope}=${group.linkValues.map(encodeURIComponent).join(",")}`;
}

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
  /**
   * An exact price for the WHOLE request, set by an admin, replacing
   * unitPrice × images. For requests the per-piece ladder can't price fairly —
   * six designs crammed onto one sticker sheet is not "one sticker".
   *
   * Only ever set from the admin-only control in the request modal, and
   * re-checked against is_admin() inside place_order: a customer who forges one
   * gets `forbidden_manual_price`, not a discount.
   */
  manualTotal?: number | null;
}

/**
 * An admin-only manual order line: a job that isn't in the catalogue at all —
 * a walk-in, a DM commission — described in free text and priced by hand.
 *
 * `customerName` / `addressLine` are collected here only to prefill the
 * checkout form; the order itself stores them the same way every other order
 * does. Nothing about this line is visible to, or creatable by, a customer.
 */
export interface ManualCartOrder {
  /** client-generated id, only used to key/remove the line */
  id: string;
  /** short label for the job, shown as the line's name */
  title: string;
  description: string;
  /** exact total for this line, in IQD */
  price: number;
  customerName: string;
  addressLine: string;
}

/** Distinct accent for custom requests everywhere (lists, badges, stats). */
export const CUSTOM_ORDER_COLOR = "#d946ef";

/**
 * Distinct accent for admin manual orders — deliberately not the custom-request
 * magenta and not the brand red, so an internally-created order is never
 * mistaken for either a customer's custom request or an ordinary sale.
 */
export const MANUAL_ORDER_COLOR = "#4f46e5";

export const CUSTOM_TYPE_LABEL: Record<CustomType, { ar: string; en: string }> = {
  brooch: { ar: "بروش", en: "Brooch" },
  sticker: { ar: "ستكر", en: "Sticker" },
  poster: { ar: "بوستر", en: "Poster" },
};

/* ------------------------------- Orders -------------------------------- */
export type OrderStatus = "review" | "accepted" | "shipped" | "delivered";

export interface OrderItem {
  productId: string;
  /** the specific package design chosen, when the product is a package */
  itemId?: string;
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
  /**
   * Artwork belonging to THIS request alone. A basket can hold several custom
   * requests of different kinds, and they used to pool their images into one
   * flat `Order.customImages` — leaving the admin a merged grid with no way to
   * tell a sticker design from a brooch one. Grouping lives here now.
   *
   * Empty when the database hasn't got `order_items.custom_images` yet, in
   * which case the admin view falls back to the merged array.
   */
  customImages: string[];
  /** which kind of non-catalogue line this is, when it is one */
  customKind?: CustomType | "manual";
  /** exact line total an admin set by hand, overriding unitPrice × qty */
  manualTotal?: number;
}

export interface Order {
  code: string;
  date: string;
  tracking?: string;
  status: OrderStatus;
  customer: string;
  phone: string;
  /** optional backup number captured at checkout */
  phone2?: string;
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
