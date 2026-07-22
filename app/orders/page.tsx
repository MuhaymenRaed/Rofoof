import { Suspense } from "react";
import { OrdersView } from "@/components/orders/orders-view";
import { requireUser } from "@/lib/auth/dal";
import { getUserOrders } from "@/lib/data/orders";
import OrdersLoading from "./loading";

// User-specific → resolved at request time, but streamed inside Suspense so
// the page shell still prerenders.
async function OrdersContent() {
  const user = await requireUser("/orders");
  const orders = await getUserOrders(user.id);
  return <OrdersView orders={orders} />;
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersLoading />}>
      <OrdersContent />
    </Suspense>
  );
}
