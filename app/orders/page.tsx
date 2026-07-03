import { OrdersView } from "@/components/orders/orders-view";
import { requireUser } from "@/lib/auth/dal";
import { getUserOrders } from "@/lib/data/orders";

// User-specific → always rendered at request time.
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const orders = await getUserOrders(user.id);
  return <OrdersView orders={orders} />;
}
