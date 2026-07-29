"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { OrderCard } from "@/components/orders/order-card";
import { Package, Trash } from "@/components/icons";
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
          onClose={() => setConfirming(null)}
          onRemoved={removeOptimistic}
          onFailed={() => router.refresh()}
        />
      )}
    </div>
  );
}

/* ---------------------------- Cancel dialog ---------------------------- */

function CancelDialog({
  order,
  onClose,
  onRemoved,
  onFailed,
}: {
  order: Order;
  onClose: () => void;
  onRemoved: (code: string) => void;
  onFailed: () => void;
}) {
  const { t } = useStore();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await cancelOrderAction(order.code);
      if (!res.ok) {
        setError(t("orders.cancelError"));
        // The order likely just got accepted — resync so the button vanishes.
        if (res.error === "cannot_cancel") {
          onFailed();
          onClose();
        }
        return;
      }
      // Optimistically drop it from the list; server already deleted it.
      onRemoved(order.code);
      onClose();
    });
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("orders.cancelTitle")}
        className="relative z-10 w-full max-w-sm animate-pop rounded-3xl border border-line-2 bg-surface p-6 text-center shadow-2xl"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/12 text-red-500">
          <Trash size={26} />
        </div>
        <h2 className="mt-4 text-lg font-black text-ink">{t("orders.cancelTitle")}</h2>
        <p className="mt-1.5 text-sm text-ink-3">{t("orders.cancelHint")}</p>
        <p dir="ltr" className="mt-3 text-sm font-black text-ink">
          {order.code}
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="tap flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-bold text-ink-2 transition hover:bg-surface-2 disabled:opacity-50"
          >
            {t("orders.cancelNo")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={pending}
            className="tap flex-1 rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {pending ? t("orders.cancelling") : t("orders.cancelYes")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
