import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders } from "@/lib/data/orders";
import { getPrintMasters } from "@/lib/data/dashboard";
import { OrdersBoard } from "@/components/dashboard/orders-board";
import DashboardLoading from "../loading";

async function OrdersContent() {
  await requireAdmin();
  // The print masters come from here rather than off the shared product list:
  // that list is the public catalogue and is stripped of them, so the
  // storefront never ships production artwork to shoppers. See getProducts().
  const [{ orders, hasMore }, printMasters] = await Promise.all([
    getAllOrders(),
    getPrintMasters(),
  ]);
  return (
    <OrdersBoard
      initialOrders={orders}
      initialHasMore={hasMore}
      printMasters={printMasters}
    />
  );
}

export default function DashboardOrdersPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <OrdersContent />
    </Suspense>
  );
}
