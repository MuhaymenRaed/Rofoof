import "server-only";
import type { Product, Order, Category, Fandom, Badge, OrderStatus } from "@/lib/products";
import type { OrderItemRow, OrderRow, ProductRow } from "@/lib/supabase/types";

/** A products row joined with its fandom + category codes. */
export type ProductRowWithFandoms = ProductRow & {
  product_fandoms?: { fandom_code: string }[] | null;
  product_categories?: { category_code: string }[] | null;
};

export function mapProduct(row: ProductRowWithFandoms): Product {
  const categories = (row.product_categories ?? []).map((c) => c.category_code);
  if (categories.length === 0 && row.category_code) categories.push(row.category_code);
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
    soldOut: row.sold_out,
    isActive: row.is_active,
    stock: row.stock,
    discountPercent: row.discount_percent ?? 0,
    rating: Number(row.rating),
    reviews: row.reviews_count,
    order: row.sort_order,
    descAr: row.description_ar,
    descEn: row.description_en,
    tags: row.tags ?? [],
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
    items: (row.order_items ?? []).map((i) => ({
      productId: i.product_id ?? "",
      qty: i.qty,
      lineTotal: i.line_total,
    })),
    total: row.total,
  };
}
