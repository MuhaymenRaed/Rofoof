"use client";

import Link from "next/link";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderTracker } from "@/components/ui/order-tracker";
import { Package } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { statusStyle, type Order } from "@/lib/products";

export function OrdersView({ orders }: { orders: Order[] }) {
  const { t } = useStore();

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
            <OrderCard key={order.code} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  const { t, lang, getProduct } = useStore();
  const accent = statusStyle[order.status].color;

  return (
    <article className="overflow-hidden rounded-2xl border border-line-2 bg-surface card-shadow">
      <div className="h-1" style={{ background: accent }} />
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-ink">{order.code}</span>
              {order.tracking && (
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3">
                  {t("orders.tracking")}: {order.tracking}
                </span>
              )}
            </div>
            <span className="text-xs text-ink-3" dir="ltr">
              {order.date}
            </span>
          </div>
          <StatusPill status={order.status} />
        </div>

        {/* Items */}
        <ul className="mt-4 space-y-2 border-t border-line-2 pt-4">
          {order.items.map((item) => {
            const product = getProduct(item.productId);
            const name = product
              ? lang === "ar"
                ? product.nameAr
                : product.nameEn
              : item.productId;
            return (
              <li
                key={item.productId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2.5 text-ink-2">
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base"
                    style={{
                      background: product
                        ? `color-mix(in srgb, ${product.color} 14%, var(--surface))`
                        : "var(--surface-2)",
                    }}
                  >
                    {product?.emoji ?? "📦"}
                  </span>
                  <span className="font-semibold text-ink">{name}</span>
                  <span className="text-ink-3">× {item.qty}</span>
                </span>
                <span className="font-bold text-ink-2">{formatPrice(item.lineTotal, lang)}</span>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-line-2 pt-4">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-2">
            <Package size={16} className="text-brand" />
            {order.customer}
          </span>
          <span className="text-base font-black text-brand">
            {formatPrice(order.total, lang)}
          </span>
        </div>

        {/* Tracker */}
        <div className="mt-5 rounded-xl bg-surface-2/50 p-4">
          <OrderTracker status={order.status} />
        </div>
      </div>
    </article>
  );
}
