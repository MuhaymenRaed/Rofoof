import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getFeaturedGroups, getProducts } from "@/lib/data/catalog";
import { FeaturedManager } from "@/components/dashboard/featured-manager";
import DashboardLoading from "../loading";

async function FeaturedContent() {
  await requireAdmin();
  const [groups, products] = await Promise.all([getFeaturedGroups(), getProducts()]);
  return <FeaturedManager initialGroups={groups} products={products} />;
}

export default function DashboardFeaturedPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <FeaturedContent />
    </Suspense>
  );
}
