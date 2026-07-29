"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { OrderCard } from "@/components/orders/order-card";
import { CancelDialog } from "@/components/orders/cancel-dialog";
import { Package } from "@/components/icons";
import { type Order } from "@/lib/products";
import { cancelOrderAction } from "@/lib/actions/orders";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function OrdersView({ orders: initialOrders }: { orders: Order[] }) {
  const { t } = useStore();
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [confirming, setConfirming] = useState<Order | null>(null);

  // Re-seed when the server sends fresh data (realtime refresh / navigation).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Real-time: when the admin changes any of this user's orders (status move,
  // or a cancel/delete elsewhere), refetch so the list stays in sync — no
  // polling, no manual refresh.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  function removeOptimistic(code: string) {
    setOrders((prev) => prev.filter((o) => o.code !== code));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-7">
        <h1 className="flex items-center gap-2.5 text-2xl font-black text-ink">
          <span className="h-6 w-1.5 rounded-full bg-brand" />
          {t("orders.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-2">{t("orders.subtitle")}</p>
      </header>

      {orders.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand">
            <Package size={28} />
          </div>
          <p className="mt-4 font-bold text-ink">{t("orders.empty")}</p>
          <Link
            href="/store"
            className="tap mt-5 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
          >
            {t("cart.browse")}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => (
            <OrderCard key={order.code} order={order} onCancel={() => setConfirming(order)} />
          ))}
        </div>
      )}

      {confirming && (
        <CancelDialog
          order={confirming}
          cancel={() => cancelOrderAction(confirming.code)}
          onClose={() => setConfirming(null)}
          onRemoved={removeOptimistic}
          onFailed={() => router.refresh()}
        />
      )}
    </div>
  );
}
