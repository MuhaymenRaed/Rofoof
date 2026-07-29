import { Suspense } from "react";
import { OrdersView } from "@/components/orders/orders-view";
import { GuestOrderTracker } from "@/components/orders/guest-order-tracker";
import { getCurrentUser } from "@/lib/auth/dal";
import { getUserOrders } from "@/lib/data/orders";
import OrdersLoading from "./loading";

// Auth state decides the whole page (resolved server-side, so no flicker):
//  • signed in  → the full order history loads automatically.
//  • guest      → the manual "track your order" lookup (Order ID + phone).
// Streamed inside Suspense so the page shell still prerenders.
async function OrdersContent() {
  const user = await getCurrentUser();
  if (!user) return <GuestOrderTracker />;

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
