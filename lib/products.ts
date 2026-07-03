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
  soldOut?: boolean;
  /** admin/inventory only — whether the product is visible in the storefront */
  isActive?: boolean;
  /** admin/inventory only — units in stock */
  stock?: number;
  /** 0–90; > 0 shows the sale UI and is charged server-side at checkout */
  discountPercent: number;
  rating: number;
  reviews: number;
  /** for "newest" sorting & the "Just landed" rail (higher = newer) */
  order: number;
  descAr: string;
  descEn: string;
  tags: string[];
}

/* ------------------------------ Pricing --------------------------------- */
/** The price actually charged (mirrors the DB `effective_price` function). */
export function effectivePrice(p: Pick<Product, "price" | "discountPercent">): number {
  return p.discountPercent > 0 ? Math.floor((p.price * (100 - p.discountPercent)) / 100) : p.price;
}

export const MAX_PRICE = 25000;

/** Category codes that can be waterproof (paper/vinyl products). */
export const WATERPROOF_CATEGORIES = ["stickers", "posters"];
export function canBeWaterproof(categoryCodes: string[]): boolean {
  return categoryCodes.some((c) => WATERPROOF_CATEGORIES.includes(c));
}

/* ------------------------------- Orders -------------------------------- */
export type OrderStatus = "review" | "accepted" | "shipped" | "delivered";

export interface OrderItem {
  productId: string;
  qty: number;
  lineTotal: number;
}

export interface Order {
  code: string;
  date: string;
  tracking?: string;
  status: OrderStatus;
  customer: string;
  items: OrderItem[];
  total: number;
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
