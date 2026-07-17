"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderTracker } from "@/components/ui/order-tracker";
import { Package, Droplet, Sparkles } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  statusStyle,
  CUSTOM_ORDER_COLOR,
  CUSTOM_TYPE_LABEL,
  type Order,
} from "@/lib/products";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function OrdersView({ orders }: { orders: Order[] }) {
  const { t } = useStore();
  const router = useRouter();

  // Real-time: when the admin moves any of this user's orders to a new step,
  // Supabase Realtime notifies us and the server refetch repaints the exact
  // color-coded status — no polling, no manual refresh.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("my-orders")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

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
  // Custom design requests wear their own signature color.
  const accent = order.isCustom ? CUSTOM_ORDER_COLOR : statusStyle[order.status].color;
  const typeMeta = order.customType ? CUSTOM_TYPE_LABEL[order.customType] : null;

  return (
    <article
      className="overflow-hidden rounded-2xl border bg-surface card-shadow"
      style={
        order.isCustom
          ? { borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 40%, transparent)` }
          : undefined
      }
    >
      <div className="h-1" style={{ background: accent }} />
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-extrabold text-ink">{order.code}</span>
              {order.isCustom && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black text-white"
                  style={{ background: CUSTOM_ORDER_COLOR }}
                >
                  <Sparkles size={10} />
                  {t("custom.badge")}
                  {typeMeta && ` · ${lang === "ar" ? typeMeta.ar : typeMeta.en}`}
                </span>
              )}
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

        {/* Custom request artwork */}
        {order.isCustom && order.customImages.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-ink-3">
              {t("custom.imagesLabel")} ({order.customImages.length})
              {order.customWaterproof && (
                <span className="inline-flex items-center gap-0.5 font-bold text-sky-600">
                  <Droplet size={10} /> {t("badge.waterproof")}
                </span>
              )}
            </p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {order.customImages.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tap relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition hover:opacity-80"
                  style={{ borderColor: CUSTOM_ORDER_COLOR }}
                >
                  <Image src={url} alt="" fill sizes="56px" className="object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        <ul className="mt-4 space-y-2 border-t border-line-2 pt-4">
          {order.items.map((item, idx) => {
            const product = getProduct(item.productId);
            const name = lang === "ar" ? item.nameAr : item.nameEn;
            const variant = lang === "ar" ? item.itemNameAr : item.itemNameEn;
            return (
              <li key={idx} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2.5 text-ink-2">
                  <span
                    className="relative grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg text-base"
                    style={{
                      background: product
                        ? `color-mix(in srgb, ${product.color} 14%, var(--surface))`
                        : "var(--surface-2)",
                    }}
                  >
                    {item.customImageUrl || product?.image ? (
                      <Image
                        src={item.customImageUrl ?? product!.image!}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                      />
                    ) : product?.emoji ? (
                      product.emoji
                    ) : (
                      <Package size={15} className="text-ink-3" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">
                      {name}
                      {variant && <span className="text-ink-3"> — {variant}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] text-ink-3">
                      × {item.qty}
                      {item.freeQty > 0 && (
                        <span className="font-bold text-emerald-600">
                          ({item.freeQty} {t("cart.free")})
                        </span>
                      )}
                      {item.waterproof && (
                        <span className="inline-flex items-center gap-0.5 font-bold text-sky-600">
                          <Droplet size={9} /> {t("badge.waterproof")}
                        </span>
                      )}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 font-bold text-ink-2">
                  {formatPrice(item.lineTotal, lang)}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Money breakdown */}
        <div className="mt-4 space-y-1 border-t border-line-2 pt-4 text-sm">
          {(order.discountTotal > 0 || order.deliveryFee > 0) && (
            <>
              <div className="flex items-center justify-between text-ink-2">
                <span>{t("cart.subtotal")}</span>
                <span className="font-semibold">{formatPrice(order.subtotal, lang)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex items-center justify-between text-emerald-600">
                  <span className="text-xs font-bold">
                    {t("cart.discount")}
                    {order.offerNote && ` · ${order.offerNote}`}
                  </span>
                  <span className="font-bold">-{formatPrice(order.discountTotal, lang)}</span>
                </div>
              )}
              {order.deliveryFee > 0 && (
                <div className="flex items-center justify-between text-ink-2">
                  <span>{t("cart.delivery")}</span>
                  <span className="font-semibold">{formatPrice(order.deliveryFee, lang)}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="flex items-center gap-2 font-semibold text-ink-2">
              <Package size={16} className="text-brand" />
              {order.customer}
            </span>
            <span className="text-base font-black text-brand">
              {formatPrice(order.total, lang)}
            </span>
          </div>
        </div>

        {/* Tracker */}
        <div className="mt-5 rounded-xl bg-surface-2/50 p-4">
          <OrderTracker status={order.status} />
        </div>
      </div>
    </article>
  );
}
