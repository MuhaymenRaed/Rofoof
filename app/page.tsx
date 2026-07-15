import { Hero } from "@/components/home/hero";
import { CategoryChips } from "@/components/ui/category-chips";
import { ProductCard } from "@/components/ui/product-card";
import { SectionTitle } from "@/components/ui/section-title";
import { getProducts } from "@/lib/data/catalog";
import type { Product } from "@/lib/products";

// ISR: storefront regenerates every 5 min, and instantly on admin edits
// (revalidateTag("products")).
export const revalidate = 300;

export default async function HomePage() {
  const products = await getProducts();
  const bestsellers = products.filter((p) => p.badge === "bestseller").slice(0, 5);
  const fresh = [...products].sort((a, b) => b.order - a.order).slice(0, 5);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <Hero />

      <div className="mt-6">
        <CategoryChips asLinks />
      </div>

      <section className="mt-9">
        <SectionTitle titleKey="section.bestsellers" viewAllHref="/store" />
        <Grid products={bestsellers} priorityCount={2} />
      </section>

      <div className="my-8 h-px bg-line-2" />

      <section>
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
