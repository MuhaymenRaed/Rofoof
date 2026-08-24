import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getInventory } from "@/lib/data/dashboard";
import { getSiteSettings } from "@/lib/data/catalog";
import { InventoryView } from "@/components/dashboard/inventory-view";
import { WaterproofSwitches } from "@/components/dashboard/waterproof-switches";
import DashboardLoading from "../loading";

async function InventoryContent() {
  await requireAdmin();
  const [{ products, hasMore }, settings] = await Promise.all([getInventory(), getSiteSettings()]);
  return (
    <>
      {/* Above the list: withdrawing an add-on the shop has run out of is the
          same kind of decision as zeroing a stock count. */}
      <WaterproofSwitches
        initialProducts={settings.waterproofProductsActive}
        initialCustom={settings.waterproofCustomActive}
      />
      <InventoryView initialProducts={products} initialHasMore={hasMore} />
    </>
  );
}

export default function DashboardInventoryPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <InventoryContent />
    </Suspense>
  );
}
