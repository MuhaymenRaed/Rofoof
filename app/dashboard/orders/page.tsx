import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders } from "@/lib/data/orders";
import { OrdersBoard } from "@/components/dashboard/orders-board";
import DashboardLoading from "../loading";

async function OrdersContent() {
  await requireAdmin();
  const { orders, hasMore } = await getAllOrders();
  return <OrdersBoard initialOrders={orders} initialHasMore={hasMore} />;
}

export default function DashboardOrdersPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <OrdersContent />
    </Suspense>
  );
}
