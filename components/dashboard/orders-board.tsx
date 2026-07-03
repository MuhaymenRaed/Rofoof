"use client";

import { useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { Check, Package } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { statusStyle, type Order, type OrderStatus } from "@/lib/products";
import { updateOrderStatusAction, loadMoreOrdersAction } from "@/lib/actions/orders";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";

const FLOW: OrderStatus[] = ["review", "accepted", "shipped", "delivered"];

export function OrdersBoard({
  initialOrders,
  initialHasMore,
}: {
  initialOrders: Order[];
  initialHasMore: boolean;
}) {
  const { t, lang } = useStore();
  const [, startTransition] = useTransition();

  // Server-paginated: the sentinel below the board fetches the next page of
  // orders (across all statuses) and appends; each column just filters the
  // growing list, so the kanban view scales without loading everything.
  const {
    items: board,
    hasMore,
    sentinelRef,
    setItems: setBoard,
  } = usePaginatedList(initialOrders, initialHasMore, async (offset) => {
    const page = await loadMoreOrdersAction(offset);
    return { items: page.orders, hasMore: page.hasMore };
  });

  function advance(code: string, current: OrderStatus) {
    const i = FLOW.indexOf(current);
    if (i >= FLOW.length - 1) return;
    const nextStatus = FLOW[i + 1];

    // optimistic update, reverted if the server rejects it
    setBoard((prev) => prev.map((o) => (o.code === code ? { ...o, status: nextStatus } : o)));
    startTransition(async () => {
      const res = await updateOrderStatusAction(code, nextStatus);
      if (!res.ok) {
        setBoard((prev) => prev.map((o) => (o.code === code ? { ...o, status: current } : o)));
      }
    });
  }

  return (
    <div>
      <div className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {FLOW.map((status) => {
          const column = board.filter((o) => o.status === status);
          const meta = statusStyle[status];
          return (
            <div key={status} className="flex w-72 shrink-0 flex-col">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-line-2 bg-surface px-3 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-bold text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                  {t(meta.key)}
                </span>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1.5 text-[11px] font-bold text-ink-2">
                  {column.length}
                </span>
              </div>

              <div className="space-y-3">
                {column.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-ink-3">
                    {t("dash.empty")}
                  </p>
                )}
                {column.map((o) => (
                  <article
                    key={o.code}
                    className="overflow-hidden rounded-2xl border border-line-2 bg-surface card-shadow"
                  >
                    <div className="h-1" style={{ background: meta.color }} />
                    <div className="p-3.5">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-extrabold text-ink">{o.code}</span>
                        <span className="text-[11px] text-ink-3" dir="ltr">
                          {o.date}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-bold text-ink">{o.customer}</p>
                      <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3">
                        <span className="flex items-center gap-1.5 text-xs text-ink-3">
                          <Package size={14} />
                          {o.items.reduce((n, i) => n + i.qty, 0)}
                        </span>
                        <span className="text-sm font-black text-brand">
                          {formatPrice(o.total, lang)}
                        </span>
                      </div>

                      {status !== "delivered" && (
                        <button
                          type="button"
                          onClick={() => advance(o.code, status)}
                          className="tap mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500/12 py-2 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500 hover:text-white"
                        >
                          <Check size={15} />
                          {status === "review" ? t("dash.acceptOrder") : t("dash.advance")}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {board.length > 0 && (
        <div ref={sentinelRef} className="p-4 text-center text-xs font-semibold text-ink-3">
          {hasMore ? t("dash.loadingMore") : t("dash.allLoaded")}
        </div>
      )}
    </div>
  );
}
