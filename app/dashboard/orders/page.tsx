import { requireAdmin } from "@/lib/auth/dal";
import { getAllOrders } from "@/lib/data/orders";
import { OrdersBoard } from "@/components/dashboard/orders-board";

export const dynamic = "force-dynamic";

export default async function DashboardOrdersPage() {
  await requireAdmin();
  const { orders, hasMore } = await getAllOrders();
  return <OrdersBoard initialOrders={orders} initialHasMore={hasMore} />;
}
