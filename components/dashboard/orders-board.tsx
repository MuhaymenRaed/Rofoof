"use client";

import { useMemo, useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { StatusPill } from "@/components/ui/status-pill";
import { Check, Package, Phone, MapPin, ChevronEnd, Droplet } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { provinceLabelKey } from "@/lib/provinces";
import { statusStyle, type Order, type OrderStatus } from "@/lib/products";
import {
  updateOrderStatusAction,
  updateManyOrderStatusesAction,
  loadMoreOrdersAction,
} from "@/lib/actions/orders";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";

const FLOW: OrderStatus[] = ["review", "accepted", "shipped", "delivered"];

function shifted(status: OrderStatus, dir: 1 | -1): OrderStatus | null {
  const i = FLOW.indexOf(status) + dir;
  return i >= 0 && i < FLOW.length ? FLOW[i] : null;
}

/** Admin orders — a grid of rectangular order cards with bulk step actions. */
export function OrdersBoard({
  initialOrders,
  initialHasMore,
}: {
  initialOrders: Order[];
  initialHasMore: boolean;
}) {
  const { t, lang } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const {
    items: orders,
    hasMore,
    sentinelRef,
    setItems: setOrders,
  } = usePaginatedList(initialOrders, initialHasMore, async (offset) => {
    const page = await loadMoreOrdersAction(offset);
    return { items: page.orders, hasMore: page.hasMore };
  });

  const allSelected = orders.length > 0 && selected.size === orders.length;

  function toggleSelect(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.code)));
  }

  /** Move ONE order a step forward/back (optimistic, reverted on failure). */
  function move(code: string, current: OrderStatus, dir: 1 | -1) {
    const next = shifted(current, dir);
    if (!next) return;
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

  const bulkBar = useMemo(
    () => (
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line-2 bg-surface p-3 card-shadow">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-ink">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
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
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSelected, selected.size, orders, t],
  );

  return (
    <div>
      {bulkBar}

      {orders.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line py-16 text-center text-sm text-ink-3">
          {t("dash.empty")}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const accent = statusStyle[o.status].color;
            const isSelected = selected.has(o.code);
            const canBack = shifted(o.status, -1) !== null;
            const canNext = shifted(o.status, 1) !== null;
            return (
              <article
                key={o.code}
                className={`overflow-hidden rounded-2xl border bg-surface card-shadow transition ${
                  isSelected ? "border-brand ring-2 ring-brand/25" : "border-line-2"
                }`}
              >
                <div className="h-1" style={{ background: accent }} />
                <div className="p-4">
                  {/* Header: select + code + status */}
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(o.code)}
                        className="h-4 w-4 accent-brand"
                      />
                      <span className="flex flex-col">
                        <span className="text-sm font-extrabold text-ink">{o.code}</span>
                        <span className="text-[11px] text-ink-3" dir="ltr">
                          {o.date}
                        </span>
                      </span>
                    </label>
                    <StatusPill status={o.status} />
                  </div>

                  {/* Customer details */}
                  <div className="mt-3 space-y-1 border-t border-line-2 pt-3 text-[12px] text-ink-2">
                    <p className="font-bold text-ink">{o.customer}</p>
                    <p className="flex items-center gap-1.5">
                      <Phone size={12} className="shrink-0 text-brand" />
                      <a href={`tel:${o.phone.replace(/\s/g, "")}`} dir="ltr" className="tap hover:text-brand">
                        {o.phone}
                      </a>
                    </p>
                    {(o.provinceCode || o.addressLine) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0 text-brand" />
                        <span className="truncate">
                          {o.provinceCode ? t(provinceLabelKey(o.provinceCode)) : ""}
                          {o.provinceCode && o.addressLine ? " · " : ""}
                          {o.addressLine ?? ""}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Contents */}
                  <ul className="mt-3 space-y-1 border-t border-line-2 pt-3">
                    {o.items.map((it, i) => {
                      const itemName = lang === "ar" ? it.nameAr : it.nameEn;
                      const variant = lang === "ar" ? it.itemNameAr : it.itemNameEn;
                      return (
                        <li key={i} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                          <Package size={11} className="shrink-0 text-ink-3" />
                          <span className="truncate">
                            {itemName}
                            {variant && <span className="text-ink-3"> — {variant}</span>}
                          </span>
                          {it.waterproof && <Droplet size={11} className="shrink-0 text-sky-500" />}
                          {it.customImageUrl && (
                            <a
                              href={it.customImageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tap shrink-0 text-[10px] font-bold text-brand hover:underline"
                            >
                              🖼️
                            </a>
                          )}
                          <span className="ms-auto shrink-0 font-bold text-ink">
                            ×{it.qty}
                            {it.freeQty > 0 && (
                              <span className="text-emerald-600"> ({it.freeQty} {t("cart.free")})</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Money + step controls */}
                  <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3">
                    <span className="flex flex-col">
                      <span className="text-sm font-black text-brand">{formatPrice(o.total, lang)}</span>
                      {(o.discountTotal > 0 || o.offerNote) && (
                        <span className="text-[10px] font-bold text-emerald-600">
                          {o.discountTotal > 0 && `-${formatPrice(o.discountTotal, lang)}`}
                          {o.offerNote && ` · ${o.offerNote}`}
                        </span>
                      )}
                    </span>
                    <span className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => move(o.code, o.status, -1)}
                        disabled={!canBack}
                        aria-label={t("dash.prevStep")}
                        className="tap grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <span className="ltr:rotate-180">
                          <ChevronEnd size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => move(o.code, o.status, 1)}
                        disabled={!canNext}
                        aria-label={t("dash.nextStep")}
                        className="tap grid h-8 place-items-center gap-1 rounded-lg bg-emerald-500/12 px-2.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <span className="flex items-center gap-1">
                          <Check size={13} />
                          <span className="rtl:rotate-180">
                            <ChevronEnd size={13} />
                          </span>
                        </span>
                      </button>
                    </span>
                  </div>
                </div>
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
    </div>
  );
}
