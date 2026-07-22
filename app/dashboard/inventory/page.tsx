import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getInventory } from "@/lib/data/dashboard";
import { InventoryView } from "@/components/dashboard/inventory-view";
import DashboardLoading from "../loading";

async function InventoryContent() {
  await requireAdmin();
  const { products, hasMore } = await getInventory();
  return <InventoryView initialProducts={products} initialHasMore={hasMore} />;
}

export default function DashboardInventoryPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <InventoryContent />
    </Suspense>
  );
}
