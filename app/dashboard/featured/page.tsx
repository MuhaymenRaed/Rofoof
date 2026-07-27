import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getFeaturedProducts } from "@/lib/data/dashboard";
import { getFeaturedTitle } from "@/lib/data/catalog";
import { FeaturedManager } from "@/components/dashboard/featured-manager";
import DashboardLoading from "../loading";

async function FeaturedContent() {
  await requireAdmin();
  const [products, title] = await Promise.all([getFeaturedProducts(), getFeaturedTitle()]);
  return <FeaturedManager initialProducts={products} titleAr={title.ar} titleEn={title.en} />;
}

export default function DashboardFeaturedPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <FeaturedContent />
    </Suspense>
  );
}
