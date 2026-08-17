import "server-only";
import type {
  Product,
  ProductItem,
  PriceTier,
  Offer,
  OfferKind,
  ProductKind,
  Order,
  OrderItem,
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
const productSelect = (itemColumns: string) =>
  "*, product_fandoms(fandom_code), product_categories(category_code), " +
  "product_subcategories(subcategory_code), " +
  `product_items(${itemColumns}), ` +
  "product_price_tiers(min_qty, unit_price)";

const ITEM_COLUMNS = "id, image_url, name_ar, name_en, price, sort_order, is_active, is_deleted";

export const PRODUCT_SELECT = productSelect(`${ITEM_COLUMNS}, stock`);

/**
 * The same select without per-item stock, for the window where this code is
 * live but `ALTER TABLE product_items ADD COLUMN stock` has not been run yet.
 * PostgREST rejects the WHOLE query when one embedded column is unknown, so
 * without this every product read — the entire storefront — would fail.
 */
export const PRODUCT_SELECT_LEGACY = productSelect(ITEM_COLUMNS);

/** PostgREST's undefined_column, i.e. "the migration hasn't been run yet". */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .*stock.* does not exist/i.test(error.message ?? "");
}

/**
 * Run a products query with per-item stock, falling back to the old column set
 * if the database hasn't got there yet. Schema and code deploy independently in
 * this project and in either order, so the read has to tolerate both shapes —
 * see the database note in AGENTS.md.
 */
export async function selectProducts<T>(
  run: (select: string) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>,
): Promise<{ data: T[] | null; error: { code?: string; message?: string } | null }> {
  const withStock = await run(PRODUCT_SELECT);
  if (!isMissingColumn(withStock.error)) return withStock;
  return run(PRODUCT_SELECT_LEGACY);
}

/** A products row joined with its fandom/category codes, items and tiers. */
export type ProductRowWithFandoms = ProductRow & {
  product_fandoms?: { fandom_code: string }[] | null;
  product_categories?: { category_code: string }[] | null;
  product_subcategories?: { subcategory_code: string }[] | null;
  product_items?:
    | {
        id: string;
        image_url: string;
        name_ar: string;
        name_en: string;
        price: number | null;
        /** absent on the legacy select — see PRODUCT_SELECT_LEGACY */
        stock?: number | null;
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
      // `?? null` and never `?? 0`: an absent column means the migration hasn't
      // run, which is "not tracked", not "sold out". See ProductItem.stock.
      stock: i.stock ?? null,
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
    subcategories: (row.product_subcategories ?? []).map((s) => s.subcategory_code),
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
    isFeatured: row.is_featured ?? false,
    order: row.sort_order,
    createdAt: row.created_at,
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
    phone2: row.customer_phone2 ?? undefined,
    provinceCode: row.province_code ?? undefined,
    addressLine: row.address_line ?? undefined,
    notes: row.notes ?? undefined,
    offerNote: row.offer_note ?? undefined,
    items: (row.order_items ?? []).map((i) => ({
      productId: i.product_id ?? "",
      itemId: i.item_id ?? undefined,
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
      // Absent until docs/admin-manual-pricing.sql runs. `?? []` and never a
      // guess at the grouping: an empty array means "this order predates
      // per-line artwork", which the admin view answers by falling back to the
      // merged `Order.customImages`. Inventing a grouping would be worse than
      // showing none — the admin downloads these to print them.
      customImages: i.custom_images ?? [],
      customKind: (i.custom_kind ?? undefined) as OrderItem["customKind"],
      manualTotal: i.manual_total ?? undefined,
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
