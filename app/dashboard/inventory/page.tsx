import { requireAdmin } from "@/lib/auth/dal";
import { getInventory } from "@/lib/data/dashboard";
import { InventoryView } from "@/components/dashboard/inventory-view";

export const dynamic = "force-dynamic";

export default async function DashboardInventoryPage() {
  await requireAdmin();
  const { products, hasMore } = await getInventory();
  return <InventoryView initialProducts={products} initialHasMore={hasMore} />;
}
