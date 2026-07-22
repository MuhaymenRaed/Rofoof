"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import {
  X,
  Package,
  Phone,
  MapPin,
  ChevronEnd,
  Droplet,
  Sparkles,
  Photo,
  Download,
} from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { downloadImagesAsZip } from "@/lib/zip";
import { provinceLabelKey } from "@/lib/provinces";
import {
  statusStyle,
  CUSTOM_ORDER_COLOR,
  CUSTOM_TYPE_LABEL,
  type Order,
  type OrderStatus,
} from "@/lib/products";
import {
  updateOrderStatusAction,
  updateManyOrderStatusesAction,
  loadMoreOrdersAction,
} from "@/lib/actions/orders";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const FLOW: OrderStatus[] = ["review", "accepted", "shipped", "delivered"];

function shifted(status: OrderStatus, dir: 1 | -1): OrderStatus | null {
  const i = FLOW.indexOf(status) + dir;
  return i >= 0 && i < FLOW.length ? FLOW[i] : null;
}

/**
 * Admin orders — one full-width row card per order. Clicking a row opens a
 * detail modal with the complete order + direct status control. A top bar
 * bulk-moves the checked orders one step forward/back.
 */
export function OrdersBoard({
  initialOrders,
  initialHasMore,
}: {
  initialOrders: Order[];
  initialHasMore: boolean;
}) {
  const { t, lang } = useStore();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Live-reflect new orders and buyer cancellations (INSERT/DELETE/UPDATE)
  // without the admin needing to refresh.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  const {
    items: orders,
    hasMore,
    sentinelRef,
    setItems: setOrders,
  } = usePaginatedList(initialOrders, initialHasMore, async (offset) => {
    const page = await loadMoreOrdersAction(offset);
    return { items: page.orders, hasMore: page.hasMore };
  });

  const detail = detailCode ? orders.find((o) => o.code === detailCode) ?? null : null;
  const allSelected = orders.length > 0 && selected.size === orders.length;

  function toggleSelect(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** Set ONE order to an exact status (optimistic, reverted on failure). */
  function setStatus(code: string, current: OrderStatus, next: OrderStatus) {
    if (next === current) return;
    setOrders((prev) => prev.map((o) => (o.code === code ? { ...o, status: next } : o)));
    startTransition(async () => {
      const res = await updateOrderStatusAction(code, next);
      if (!res.ok) {
        setOrders((prev) => prev.map((o) => (o.code === code ? { ...o, status: current } : o)));
      }
    });
  }

  /** Move every selected order a step forward/back in one action. */
  function bulkMove(dir: 1 | -1) {
    const updates = orders
      .filter((o) => selected.has(o.code))
      .map((o) => ({ code: o.code, status: shifted(o.status, dir) }))
      .filter((u): u is { code: string; status: OrderStatus } => u.status !== null);
    if (updates.length === 0) return;

    const before = new Map(orders.map((o) => [o.code, o.status]));
    setOrders((prev) =>
      prev.map((o) => {
        const u = updates.find((x) => x.code === o.code);
        return u ? { ...o, status: u.status } : o;
      }),
    );
    startTransition(async () => {
      const res = await updateManyOrderStatusesAction(updates);
      if (res.failed.length > 0) {
        setOrders((prev) =>
          prev.map((o) =>
            res.failed.includes(o.code) ? { ...o, status: before.get(o.code) ?? o.status } : o,
          ),
        );
      }
    });
  }

  return (
    <div>
      {/* Bulk actions bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line-2 bg-surface p-3 card-shadow">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.code)))
            }
            className="h-4 w-4 accent-brand"
          />
          {t("dash.selectAll")}
        </label>
        {selected.size > 0 && (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-bold text-brand">
            {selected.size} {t("dash.selected")}
          </span>
        )}
        <div className="ms-auto flex gap-2">
          <button
            type="button"
            onClick={() => bulkMove(-1)}
            disabled={selected.size === 0}
            className="tap inline-flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2 text-xs font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="ltr:rotate-180">
              <ChevronEnd size={14} />
            </span>
            {t("dash.prevStep")}
          </button>
          <button
            type="button"
            onClick={() => bulkMove(1)}
            disabled={selected.size === 0}
            className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("dash.nextStep")}
            <span className="rtl:rotate-180">
              <ChevronEnd size={14} />
            </span>
          </button>
        </div>
      </div>

      {/* One order per row */}
      {orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-3">
          {t("dash.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const accent = o.isCustom ? CUSTOM_ORDER_COLOR : statusStyle[o.status].color;
            const isSelected = selected.has(o.code);
            const first = o.items[0];
            const firstName = first ? (lang === "ar" ? first.nameAr : first.nameEn) : "";
            const itemCount = o.items.reduce((n, i) => n + i.qty, 0);
            const typeMeta = o.customType ? CUSTOM_TYPE_LABEL[o.customType] : null;
            return (
              <article
                key={o.code}
                onClick={() => setDetailCode(o.code)}
                className={`tap flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl border bg-surface p-4 card-shadow transition hover:-translate-y-0.5 hover:border-brand sm:gap-4 sm:px-5 ${
                  isSelected ? "border-brand ring-2 ring-brand/25" : "border-line-2"
                }`}
                style={
                  o.isCustom && !isSelected
                    ? {
                        borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 40%, transparent)`,
                        background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 4%, var(--surface))`,
                      }
                    : undefined
                }
              >
                {/* accent: status color, or the custom-request signature color */}
                <span className="h-12 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />

                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(o.code)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={o.code}
                  className="h-4 w-4 shrink-0 accent-brand"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-extrabold text-ink">{o.code}</span>
                    {o.isCustom && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black text-white"
                        style={{ background: CUSTOM_ORDER_COLOR }}
                      >
                        <Sparkles size={9} />
                        {t("custom.badge")}
                        {typeMeta && ` · ${lang === "ar" ? typeMeta.ar : typeMeta.en}`}
                      </span>
                    )}
                    <span className="text-[11px] text-ink-3" dir="ltr">
                      {o.date}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-bold text-ink-2">
                    {o.customer}
                    <span dir="ltr" className="ms-2 text-[11px] font-semibold text-ink-3">
                      {o.phone}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
                    <Package size={12} className="shrink-0" />
                    <span className="truncate">
                      {firstName}
                      {o.items.length > 1 && ` +${o.items.length - 1}`}
                    </span>
                    <span className="shrink-0">
                      · {itemCount} {t("dash.itemsLabel")}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusPill status={o.status} />
                  <span className="text-sm font-black text-brand">{formatPrice(o.total, lang)}</span>
                </div>

                <span className="shrink-0 text-ink-3 rtl:rotate-180" aria-hidden>
                  <ChevronEnd size={16} />
                </span>
              </article>
            );
          })}
        </div>
      )}

      {orders.length > 0 && (
        <div ref={sentinelRef} className="p-4 text-center text-xs font-semibold text-ink-3">
          {hasMore ? t("dash.loadingMore") : t("dash.allLoaded")}
        </div>
      )}

      {detail && (
        <OrderDetailsModal
          order={detail}
          onClose={() => setDetailCode(null)}
          onSetStatus={(next) => setStatus(detail.code, detail.status, next)}
        />
      )}
    </div>
  );
}

/* ---------------------------- Details modal ----------------------------- */

function OrderDetailsModal({
  order,
  onClose,
  onSetStatus,
}: {
  order: Order;
  onClose: () => void;
  onSetStatus: (next: OrderStatus) => void;
}) {
  const { t, lang } = useStore();
  const accent = order.isCustom ? CUSTOM_ORDER_COLOR : statusStyle[order.status].color;
  const typeMeta = order.customType ? CUSTOM_TYPE_LABEL[order.customType] : null;

  // Every buyer-uploaded image tied to this order (custom artwork + per-item
  // poster uploads) — bundled by the admin-only "Download all" button.
  const imageUrls = [
    ...order.customImages,
    ...order.items.map((it) => it.customImageUrl).filter((u): u is string => !!u),
  ];
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  async function handleDownloadAll() {
    setDownloadError(false);
    setDownloading(true);
    try {
      await downloadImagesAsZip(imageUrls, `${order.code}-images.zip`);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const content = (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={order.code}
        className="relative z-10 flex max-h-[90vh] w-full max-w-md animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl"
      >
        <div className="h-1 shrink-0" style={{ background: accent }} />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-5 py-4">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-base font-black text-ink">
              {t("dash.orderDetails")} · {order.code}
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
            </h2>
            <span className="text-[11px] text-ink-3" dir="ltr">
              {order.date}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Admin-only: download all of this order's images as one ZIP */}
          {imageUrls.length > 0 && (
            <div>
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloading}
                className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-brand/40 bg-brand-soft px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand hover:text-white disabled:opacity-60"
              >
                <Download size={16} />
                {downloading ? t("dash.downloading") : `${t("dash.downloadAll")} (${imageUrls.length})`}
              </button>
              {downloadError && (
                <p className="mt-1.5 text-center text-[11px] font-semibold text-red-500">
                  {t("dash.downloadError")}
                </p>
              )}
            </div>
          )}

          {/* Full status control */}
          <div>
            <p className="mb-2 text-xs font-bold text-ink-2">{t("dash.setStatus")}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {FLOW.map((s) => {
                const meta = statusStyle[s];
                const active = order.status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSetStatus(s)}
                    aria-pressed={active}
                    className={`tap rounded-xl border px-1 py-2 text-[10px] font-bold transition ${
                      active ? "text-white" : "border-line bg-surface text-ink-2 hover:text-ink"
                    }`}
                    style={active ? { background: meta.color, borderColor: meta.color } : undefined}
                  >
                    {t(meta.key)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-2xl border border-line-2 bg-surface-2/40 p-4">
            <p className="mb-2 text-xs font-bold text-ink-2">{t("dash.customerInfo")}</p>
            <p className="text-sm font-extrabold text-ink">{order.customer}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-ink-2">
              <Phone size={13} className="shrink-0 text-brand" />
              <a
                href={`tel:${order.phone.replace(/\s/g, "")}`}
                dir="ltr"
                className="tap font-semibold hover:text-brand"
              >
                {order.phone}
              </a>
            </p>
            {(order.provinceCode || order.addressLine) && (
              <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2">
                <MapPin size={13} className="mt-0.5 shrink-0 text-brand" />
                <span>
                  {order.provinceCode ? t(provinceLabelKey(order.provinceCode)) : ""}
                  {order.provinceCode && order.addressLine ? " · " : ""}
                  {order.addressLine ?? ""}
                </span>
              </p>
            )}
            {order.notes && (
              <p className="mt-2 text-[12px] italic text-ink-3">&ldquo;{order.notes}&rdquo;</p>
            )}
          </div>

          {/* Custom request artwork */}
          {order.isCustom && order.customImages.length > 0 && (
            <div
              className="rounded-2xl border p-4"
              style={{
                borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 35%, transparent)`,
                background: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 5%, var(--surface))`,
              }}
            >
              <p className="mb-2 flex items-center gap-2 text-xs font-bold text-ink-2">
                {t("custom.imagesLabel")} ({order.customImages.length})
                {order.customWaterproof && (
                  <span className="inline-flex items-center gap-0.5 font-bold text-sky-600">
                    <Droplet size={11} /> {t("badge.waterproof")}
                  </span>
                )}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {order.customImages.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap relative aspect-square overflow-hidden rounded-lg border border-line-2 transition hover:opacity-80"
                  >
                    <Image src={url} alt="" fill sizes="72px" className="object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          <ul className="space-y-2">
            {order.items.map((it, i) => {
              const itemName = lang === "ar" ? it.nameAr : it.nameEn;
              const variant = lang === "ar" ? it.itemNameAr : it.itemNameEn;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-xl border border-line-2 px-3 py-2.5 text-[13px]"
                >
                  <Package size={13} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">
                      {itemName}
                      {variant && <span className="font-semibold text-ink-3"> — {variant}</span>}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                      ×{it.qty}
                      {it.freeQty > 0 && (
                        <span className="font-bold text-emerald-600">
                          ({it.freeQty} {t("cart.free")})
                        </span>
                      )}
                      {it.waterproof && (
                        <span className="inline-flex items-center gap-0.5 font-bold text-sky-600">
                          <Droplet size={10} /> {t("badge.waterproof")}
                        </span>
                      )}
                      {it.note && (
                        <span className="truncate italic">&ldquo;{it.note}&rdquo;</span>
                      )}
                    </span>
                  </span>
                  {it.customImageUrl && (
                    <a
                      href={it.customImageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("custom.imagesLabel")}
                      className="tap grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand transition hover:bg-brand hover:text-white"
                    >
                      <Photo size={14} />
                    </a>
                  )}
                  <span className="shrink-0 font-bold text-ink-2">
                    {formatPrice(it.lineTotal, lang)}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Money breakdown */}
          <div className="space-y-1 rounded-2xl border border-line-2 p-4 text-sm">
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
            <div className="flex items-center justify-between border-t border-line-2 pt-2">
              <span className="font-bold text-ink">{t("cart.total")}</span>
              <span className="text-base font-black text-brand">
                {formatPrice(order.total, lang)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
