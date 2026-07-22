import "server-only";
import type {
  Product,
  ProductItem,
  PriceTier,
  Offer,
  OfferKind,
  ProductKind,
  Order,
  Category,
  Fandom,
  Badge,
  OrderStatus,
} from "@/lib/products";
import type { OrderItemRow, OrderRow, ProductRow } from "@/lib/supabase/types";

/**
 * PostgREST select that hydrates a product with everything mapProduct() needs:
 * category/fandom codes, package items, and volume-price tiers. Shared by the
 * public catalog and the admin inventory so the embed can never drift.
 */
export const PRODUCT_SELECT =
  "*, product_fandoms(fandom_code), product_categories(category_code), " +
  "product_items(id, image_url, name_ar, name_en, price, sort_order, is_active, is_deleted), " +
  "product_price_tiers(min_qty, unit_price)";

/** A products row joined with its fandom/category codes, items and tiers. */
export type ProductRowWithFandoms = ProductRow & {
  product_fandoms?: { fandom_code: string }[] | null;
  product_categories?: { category_code: string }[] | null;
  product_items?:
    | {
        id: string;
        image_url: string;
        name_ar: string;
        name_en: string;
        price: number | null;
        sort_order: number;
        is_active: boolean;
        is_deleted: boolean;
      }[]
    | null;
  product_price_tiers?: { min_qty: number; unit_price: number }[] | null;
};

export function mapProduct(row: ProductRowWithFandoms): Product {
  const categories = (row.product_categories ?? []).map((c) => c.category_code);
  if (categories.length === 0 && row.category_code) categories.push(row.category_code);

  const items: ProductItem[] = (row.product_items ?? [])
    .filter((i) => !i.is_deleted && i.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i) => ({
      id: i.id,
      imageUrl: i.image_url,
      nameAr: i.name_ar,
      nameEn: i.name_en,
      price: i.price,
    }));

  const tiers: PriceTier[] = (row.product_price_tiers ?? [])
    .slice()
    .sort((a, b) => a.min_qty - b.min_qty)
    .map((t) => ({ minQty: t.min_qty, unitPrice: t.unit_price }));

  return {
    id: row.id,
    nameAr: row.name_ar,
    nameEn: row.name_en,
    subAr: row.sub_ar,
    subEn: row.sub_en,
    price: row.price,
    emoji: row.emoji,
    images: row.images ?? [],
    image: row.image_url ?? row.images?.[0] ?? undefined,
    color: row.color,
    category: (categories[0] ?? row.category_code) as Category,
    categories,
    fandoms: (row.product_fandoms ?? []).map((f) => f.fandom_code as Fandom),
    badge: (row.badge ?? undefined) as Badge | undefined,
    waterproof: row.waterproof,
    waterproofSurcharge: row.waterproof_surcharge ?? 0,
    allowCustomImage: row.allow_custom_image ?? false,
    kind: (row.kind ?? "standard") as ProductKind,
    items,
    tiers,
    soldOut: row.sold_out,
    isActive: row.is_active,
    stock: row.stock,
    discountPercent: row.discount_percent ?? 0,
    discountFixed: row.discount_fixed ?? 0,
    volumePriced: row.volume_priced ?? false,
    order: row.sort_order,
    descAr: row.description_ar,
    descEn: row.description_en,
    tags: row.tags ?? [],
  };
}

/** An offers row → domain (RLS pre-filters to live ones for non-admins). */
export interface OfferRowLike {
  id: string;
  kind: string;
  title_ar: string;
  title_en: string;
  product_id: string | null;
  buy_qty: number | null;
  free_qty: number | null;
  min_cart_total: number | null;
  percent: number | null;
  delivery_fee: number | null;
  ends_at: string | null;
}

export function mapOffer(row: OfferRowLike): Offer {
  return {
    id: row.id,
    kind: row.kind as OfferKind,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    productId: row.product_id,
    buyQty: row.buy_qty,
    freeQty: row.free_qty,
    minCartTotal: row.min_cart_total,
    percent: row.percent,
    deliveryFee: row.delivery_fee,
    endsAt: row.ends_at,
  };
}

/** An orders row joined with its items. */
export type OrderRowWithItems = OrderRow & { order_items?: OrderItemRow[] | null };

export function mapOrder(row: OrderRowWithItems): Order {
  return {
    code: row.code,
    date: row.created_at.slice(0, 10),
    tracking: row.tracking ?? undefined,
    status: row.status as OrderStatus,
    customer: row.customer_name,
    phone: row.customer_phone,
    provinceCode: row.province_code ?? undefined,
    addressLine: row.address_line ?? undefined,
    notes: row.notes ?? undefined,
    offerNote: row.offer_note ?? undefined,
    items: (row.order_items ?? []).map((i) => ({
      productId: i.product_id ?? "",
      qty: i.qty,
      freeQty: i.free_qty ?? 0,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
      nameAr: i.name_ar_snapshot,
      nameEn: i.name_en_snapshot,
      itemNameAr: i.item_name_ar ?? undefined,
      itemNameEn: i.item_name_en ?? undefined,
      waterproof: i.waterproof ?? false,
      customImageUrl: i.custom_image_url ?? undefined,
      note: i.note ?? undefined,
    })),
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    deliveryFee: row.delivery_fee,
    total: row.total,
    isCustom: row.is_custom ?? false,
    customType: (row.custom_type ?? undefined) as Order["customType"],
    customImages: row.custom_images ?? [],
    customWaterproof: row.custom_waterproof ?? false,
  };
}
