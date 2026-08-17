import { Hero } from "@/components/home/hero";
import { ProductCard } from "@/components/ui/product-card";
import { SectionTitle } from "@/components/ui/section-title";
import { FeaturedSection } from "@/components/home/featured-section";
import { DeliveryNotice } from "@/components/home/delivery-notice";
import {
  getProducts,
  getBestSellerCounts,
  getFeaturedGroups,
  getSiteSettings,
} from "@/lib/data/catalog";
import type { Product } from "@/lib/products";

/**
 * Cards per home-page rail. Four rather than five so a rail is exactly one full
 * row at every breakpoint the grid below has a column count for — a fifth card
 * only ever filled the row on the widest screens and hung off the end of it
 * everywhere between.
 */
const RAIL_SIZE = 4;

// ISR: storefront regenerates every 5 min, and instantly on admin edits
// (revalidateTag("products")) or when an order is placed (revalidateTag("sales")).

export default async function HomePage() {
  const [products, sold, featuredGroups, siteSettings] = await Promise.all([
    getProducts(),
    getBestSellerCounts(),
    getFeaturedGroups(),
    getSiteSettings(),
  ]);

  // "الأكثر طلباً" — ranked by units actually ordered. Before the store has any
  // sales there's nothing to rank, so it falls back to the curated badge.
  const ranked = [...products]
    .map((p) => ({ p, units: sold[p.id] ?? 0 }))
    .sort((a, b) => b.units - a.units || b.p.order - a.p.order);
  const hasSales = ranked.some((r) => r.units > 0);
  const bestsellers = (
    hasSales ? ranked.filter((r) => r.units > 0) : ranked.filter((r) => r.p.badge === "bestseller")
  )
    .slice(0, RAIL_SIZE)
    .map((r) => r.p);

  // Admin-curated showcases. Each group is its own rail, in the admin's order;
  // groups whose products are all gone/hidden are skipped rather than shown empty.
  // Only the ids cross to the client — the rail resolves them from the store's
  // one copy of the catalogue. `live` still gates on the real product so a group
  // referencing a hidden or deleted item doesn't render a gap.
  const live = new Set(products.map((p) => p.id));
  const rails = featuredGroups
    .map((g) => ({
      group: g,
      productIds: g.productIds.filter((id) => live.has(id)).slice(0, 10),
    }))
    .filter((r) => r.productIds.length > 0);

  // "وصل حديثاً" — genuinely newest rows, not the admin's manual ordering.
  const fresh = [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RAIL_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Hero />

      {/* Directly under the hero, before any price is shown — so the delivery
          cost is part of the first impression rather than a surprise found
          further down. The admin can switch it off from the dashboard. */}
      {siteSettings.deliveryNoticeActive && (
        <div className="mt-6">
          <DeliveryNotice />
        </div>
      )}

      {bestsellers.length > 0 && (
        <>
          <section className="mt-9">
            <SectionTitle titleKey="section.bestsellers" viewAllHref="/store" />
            <Grid products={bestsellers} priorityCount={2} />
          </section>

          <div className="my-8 h-px bg-line-2" />
        </>
      )}

      {rails.map(({ group, productIds }) => (
        <div key={group.id}>
          <FeaturedSection group={group} productIds={productIds} />
          <div className="my-8 h-px bg-line-2" />
        </div>
      ))}

      <section className={bestsellers.length > 0 || rails.length > 0 ? undefined : "mt-9"}>
        <SectionTitle titleKey="section.fresh" viewAllHref="/store" />
        <Grid products={fresh} />
      </section>

    </div>
  );
}

function Grid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    // Tops out at 4 columns to match RAIL_SIZE, so a rail always reads as one
    // complete row instead of leaving a hole on the widest screens.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <ProductCard key={p.id} productId={p.id} priority={i < priorityCount} />
      ))}
    </div>
  );
}
