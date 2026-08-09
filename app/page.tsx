import { Hero } from "@/components/home/hero";
import { ProductCard } from "@/components/ui/product-card";
import { SectionTitle } from "@/components/ui/section-title";
import { FeaturedSection } from "@/components/home/featured-section";
import { DeliveryNotice } from "@/components/home/delivery-notice";
import { getProducts, getBestSellerCounts, getFeaturedGroups } from "@/lib/data/catalog";
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
  const [products, sold, featuredGroups] = await Promise.all([
    getProducts(),
    getBestSellerCounts(),
    getFeaturedGroups(),
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
  const byId = new Map(products.map((p) => [p.id, p]));
  const rails = featuredGroups
    .map((g) => ({
      group: g,
      products: g.productIds
        .map((id) => byId.get(id))
        .filter((p): p is Product => p !== undefined)
        .slice(0, 10),
    }))
    .filter((r) => r.products.length > 0);

  // "وصل حديثاً" — genuinely newest rows, not the admin's manual ordering.
  const fresh = [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RAIL_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Hero />

      {bestsellers.length > 0 && (
        <>
          <section className="mt-9">
            <SectionTitle titleKey="section.bestsellers" viewAllHref="/store" />
            <Grid products={bestsellers} priorityCount={2} />
          </section>

          {/* Straight under the best sellers: the shopper has just seen prices,
              so this is the moment the delivery cost is actually a question. */}
          <div className="mt-6">
            <DeliveryNotice />
          </div>

          <div className="my-8 h-px bg-line-2" />
        </>
      )}

      {rails.map(({ group, products: railProducts }) => (
        <div key={group.id}>
          <FeaturedSection group={group} products={railProducts} />
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
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
