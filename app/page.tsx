import { Hero } from "@/components/home/hero";
import { CategoryChips } from "@/components/ui/category-chips";
import { ProductCard } from "@/components/ui/product-card";
import { SectionTitle } from "@/components/ui/section-title";
import { getProducts, getBestSellerCounts } from "@/lib/data/catalog";
import type { Product } from "@/lib/products";

// ISR: storefront regenerates every 5 min, and instantly on admin edits
// (revalidateTag("products")) or when an order is placed (revalidateTag("sales")).

export default async function HomePage() {
  const [products, sold] = await Promise.all([getProducts(), getBestSellerCounts()]);

  // "الأكثر طلباً" — ranked by units actually ordered. Before the store has any
  // sales there's nothing to rank, so it falls back to the curated badge.
  const ranked = [...products]
    .map((p) => ({ p, units: sold[p.id] ?? 0 }))
    .sort((a, b) => b.units - a.units || b.p.order - a.p.order);
  const hasSales = ranked.some((r) => r.units > 0);
  const bestsellers = (
    hasSales ? ranked.filter((r) => r.units > 0) : ranked.filter((r) => r.p.badge === "bestseller")
  )
    .slice(0, 5)
    .map((r) => r.p);

  // "وصل حديثاً" — genuinely newest rows, not the admin's manual ordering.
  const fresh = [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Hero />

      <div className="mt-6">
        <CategoryChips asLinks />
      </div>

      {bestsellers.length > 0 && (
        <>
          <section className="mt-9">
            <SectionTitle titleKey="section.bestsellers" viewAllHref="/store" />
            <Grid products={bestsellers} priorityCount={2} />
          </section>

          <div className="my-8 h-px bg-line-2" />
        </>
      )}

      <section className={bestsellers.length > 0 ? undefined : "mt-9"}>
        <SectionTitle titleKey="section.fresh" viewAllHref="/store" />
        <Grid products={fresh} />
      </section>

    </div>
  );
}

function Grid({ products, priorityCount = 0 }: { products: Product[]; priorityCount?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}
