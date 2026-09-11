"use client";

import { useState } from "react";
import { RetryImage } from "@/components/ui/retry-image";
import { Lightbox } from "@/components/ui/lightbox";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { OrderTracker } from "@/components/ui/order-tracker";
import { Package, Droplet, Sparkles, X } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  statusStyle,
  orderItemImage,
  CUSTOM_ORDER_COLOR,
  CUSTOM_TYPE_LABEL,
  type Order,
} from "@/lib/products";

/**
 * A single order, shown identically in the signed-in order history and the
 * guest order tracker. Pass `onCancel` to expose the cancel button (owner +
 * still in review only); omit it for read-only contexts like guest tracking.
 */
export function OrderCard({ order, onCancel }: { order: Order; onCancel?: () => void }) {
  const { t, lang, getProduct } = useStore();
  // Custom design requests wear their own signature color.
  const accent = order.isCustom ? CUSTOM_ORDER_COLOR : statusStyle[order.status].color;
  const typeMeta = order.customType ? CUSTOM_TYPE_LABEL[order.customType] : null;

  // Every picture in the order, in the order they appear on the card, so a
  // tap on any thumbnail opens the viewer there and a swipe walks the rest.
  // It's the same full-screen viewer as the store's product gallery: in-app,
  // with retries on a dropped request, rather than a raw Storage link that
  // leaves the site and shows the browser's broken-image glyph when it fails.
  // Deduped because the viewer keys its thumbnail strip by URL.
  const lineImages = order.items.map((item) => orderItemImage(item, getProduct(item.productId)));
  const viewerImages = Array.from(
    new Set([...order.customImages, ...lineImages.filter((u): u is string => !!u)]),
  );
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  function openViewer(src: string) {
    const i = viewerImages.indexOf(src);
    setLightboxIndex(i >= 0 ? i : 0);
  }

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

        {/* Custom request artwork (shown whenever the order carries any, even
            when it also has regular products) */}
        {order.customImages.length > 0 && (
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
                <button
                  key={url}
                  type="button"
                  onClick={() => openViewer(url)}
                  aria-label={t("custom.imagesLabel")}
                  className="tap relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition hover:opacity-80"
                  style={{ borderColor: CUSTOM_ORDER_COLOR }}
                >
                  <RetryImage src={url} alt="" fill sizes="56px" className="object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Items — each line shows the picture of what was actually ordered
            (the buyer's upload, else the package design they picked), never
            just the package cover: a shopper checking on a twelve-design
            package wants to see which one is coming. Same rule as the admin
            board. Tapping opens the full-size viewer, since 56px is for
            recognising a design, not inspecting it. */}
        <ul className="mt-4 space-y-2.5 border-t border-line-2 pt-4">
          {order.items.map((item, idx) => {
            const product = getProduct(item.productId);
            const image = lineImages[idx];
            const name = lang === "ar" ? item.nameAr : item.nameEn;
            const variant = lang === "ar" ? item.itemNameAr : item.itemNameEn;
            const tint = product
              ? `color-mix(in srgb, ${product.color} 14%, var(--surface))`
              : "var(--surface-2)";
            return (
              <li key={idx} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-3 text-ink-2">
                  {image ? (
                    <button
                      type="button"
                      onClick={() => openViewer(image)}
                      aria-label={variant ? `${name} — ${variant}` : name}
                      className="tap relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 transition hover:opacity-80"
                      style={{
                        background: tint,
                        // The same "this opens" edge the custom strip wears,
                        // in the product's own colour instead of the custom one.
                        borderColor: product
                          ? `color-mix(in srgb, ${product.color} 40%, transparent)`
                          : "var(--line-2)",
                      }}
                    >
                      <RetryImage src={image} alt="" fill sizes="56px" className="object-cover" />
                    </button>
                  ) : (
                    <span
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-2xl"
                      style={{ background: tint }}
                    >
                      {product?.emoji ? product.emoji : <Package size={18} className="text-ink-3" />}
                    </span>
                  )}
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

        {/* Money breakdown — always itemized so the total is fully transparent:
            products − discount + delivery. Computed here (not the stored total)
            so it's always correct even if the column lags. */}
        <div className="mt-4 space-y-1.5 border-t border-line-2 pt-4 text-sm">
          <div className="flex items-center justify-between text-ink-2">
            <span>{t("cart.subtotal")}</span>
            <span className="font-semibold text-ink">{formatPrice(order.subtotal, lang)}</span>
          </div>
          <div
            className={`flex items-center justify-between ${
              order.discountTotal > 0 ? "text-emerald-600" : "text-ink-2"
            }`}
          >
            <span className={order.discountTotal > 0 ? "text-xs font-bold" : undefined}>
              {t("cart.discount")}
              {order.discountTotal > 0 && order.offerNote ? ` · ${order.offerNote}` : ""}
            </span>
            <span className="font-bold">
              {order.discountTotal > 0
                ? `-${formatPrice(order.discountTotal, lang)}`
                : formatPrice(0, lang)}
            </span>
          </div>
          <div className="flex items-center justify-between text-ink-2">
            <span>{t("cart.delivery")}</span>
            <span className="font-semibold text-ink">
              {order.deliveryFee > 0
                ? formatPrice(order.deliveryFee, lang)
                : t("cart.freeDelivery")}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-line-2 pt-2">
            <span className="font-black text-ink">{t("cart.total")}</span>
            <span className="text-base font-black text-brand">
              {formatPrice(
                Math.max(order.subtotal - order.discountTotal, 0) + order.deliveryFee,
                lang,
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1 text-ink-2">
            <Package size={15} className="shrink-0 text-brand" />
            <span className="font-semibold">{order.customer}</span>
          </div>
        </div>

        {/* Tracker */}
        <div className="mt-5 rounded-xl bg-surface-2/50 p-4">
          <OrderTracker status={order.status} />
        </div>

        {/* Cancel — only while the order is still in review (not yet accepted),
            and only where a cancel handler is provided (the owner's history). */}
        {onCancel && order.status === "review" && (
          <button
            type="button"
            onClick={onCancel}
            className="tap mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2.5 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white"
          >
            <X size={15} />
            {t("orders.cancel")}
          </button>
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={viewerImages}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          alt={order.code}
        />
      )}
    </article>
  );
}
