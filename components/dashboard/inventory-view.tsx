"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { ProductMedia } from "@/components/ui/product-media";
import { ProductEditorModal } from "@/components/dashboard/product-editor-modal";
import { Pencil } from "@/components/dashboard/dash-icons";
import { Plus } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import {
  LOW_STOCK_BELOW,
  effectivePrice,
  lowStockUnits,
  outOfStockUnits,
  totalStockFor,
  type Product,
} from "@/lib/products";
import type { StockCounts, StockFilter } from "@/lib/data/stock";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import {
  setProductActiveAction,
  loadMoreInventoryAction,
  refreshStockCountsAction,
} from "@/lib/actions/products";

export function InventoryView({
  initialProducts,
  initialHasMore,
  initialCounts,
}: {
  initialProducts: Product[];
  initialHasMore: boolean;
  /** Whole-catalogue stock counts — see getStockIndex(). */
  initialCounts: StockCounts;
}) {
  const { t, lang, categoryLabel } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [filter, setFilter] = useState<StockFilter | null>(null);
  const [counts, setCounts] = useState(initialCounts);
  const [, startTransition] = useTransition();

  /**
   * The filter is a SERVER query, not a `.filter()` over what's on screen.
   *
   * This list pages in thirty at a time and the shop is a hundred products
   * deep, so filtering in the browser only ever searched the pages that had
   * been scrolled past: a design that ran out on page three simply wasn't in
   * the array, and the chip counted one empty product while there were two.
   * Scrolling changed the answer — which is how you could tell it was lying.
   *
   * Changing the filter re-fetches page 0 with it applied; the infinite scroll
   * below then pages through the filtered set the same way.
   */
  const [seedItems, setSeedItems] = useState(initialProducts);
  const [seedHasMore, setSeedHasMore] = useState(initialHasMore);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let active = true;
    startTransition(async () => {
      const page = await loadMoreInventoryAction(0, filter ?? undefined);
      if (!active) return;
      setSeedItems(page.products);
      setSeedHasMore(page.hasMore);
    });
    return () => {
      active = false;
    };
  }, [filter]);

  const {
    items: list,
    hasMore,
    sentinelRef,
    setItems: setList,
  } = usePaginatedList(seedItems, seedHasMore, async (offset) => {
    const page = await loadMoreInventoryAction(offset, filter ?? undefined);
    return { items: page.products, hasMore: page.hasMore };
  });

  /** Re-read the chips from the shelf after anything that could have moved it. */
  function refreshCounts() {
    startTransition(async () => {
      setCounts(await refreshStockCountsAction());
    });
  }

  /**
   * The chips count SHELF UNITS — designs, or a plain product — which is the
   * same figure the overview's tiles show, so the two screens can no longer
   * give different answers to the same question. The list underneath is the
   * PRODUCTS those units live in, which is a smaller number (89 low designs sit
   * inside 52 packages), so the tooltip says both.
   */
  const chips: {
    key: StockFilter;
    label: string;
    count: number;
    title: string;
    tone: string;
    on: string;
    badgeOn: string;
  }[] = [
    {
      key: "out",
      label: t("dash.outOfStock"),
      count: counts.outUnits,
      title: `${counts.outUnits} ${t("dash.unitsOut")} · ${t("dash.inProducts")} ${counts.outProducts} ${t("dash.productsLabel")}`,
      tone: "text-red-500",
      on: "border-red-500 bg-red-500/10 text-red-500",
      badgeOn: "bg-red-500/15",
    },
    {
      key: "low",
      label: t("dash.lowStock"),
      count: counts.lowUnits,
      title: `${counts.lowUnits} ${t("dash.unitsLow")} · ${t("dash.inProducts")} ${counts.lowProducts} ${t("dash.productsLabel")}`,
      tone: "text-amber-600",
      on: "border-amber-500 bg-amber-500/10 text-amber-600",
      badgeOn: "bg-amber-500/15",
    },
  ];

  function toggleActive(id: string, current: boolean) {
    setList((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !current } : p)));
    startTransition(async () => {
      const res = await setProductActiveAction(id, !current);
      if (!res.ok) {
        setList((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: current } : p)));
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-2 p-5">
        <h2 className="text-sm font-extrabold text-ink">{t("dash.inventory")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Counts are the WHOLE catalogue, not the loaded pages — pressing a
              chip asks the server for exactly those products. */}
          {chips.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                title={c.title}
                onClick={() => setFilter(on ? null : c.key)}
                className={`tap inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  on ? c.on : `border-line text-ink-2 hover:border-brand hover:text-brand`
                }`}
              >
                {c.label}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                    on
                      ? c.badgeOn
                      : c.count > 0
                        ? `bg-surface-2 ${c.tone}`
                        : "bg-surface-2 text-ink-3"
                  }`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="tap cta inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition"
          >
            <Plus size={16} />
            {t("dash.addProduct")}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-line-2">
        {list.map((p) => {
          const name = lang === "ar" ? p.nameAr : p.nameEn;
          const isActive = p.isActive !== false;
          const stock = totalStockFor(p);
          const empty = stock === 0;
          // A package's chip is its designs added up; these two say how many of
          // those designs are at zero or running low, since the sum alone
          // can't. Both are 0 for a plain product — its own count is the chip.
          const designsOut = p.kind === "package" ? outOfStockUnits(p) : 0;
          const designsLow = p.kind === "package" ? lowStockUnits(p) : 0;
          return (
            <li key={p.id} className="flex items-center gap-3 p-4 sm:px-5">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl">
                <ProductMedia product={p} name={name} emojiClassName="text-2xl" sizes="48px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-ink">{name}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {p.categories.slice(0, 3).map((code) => (
                    <span
                      key={code}
                      className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3"
                    >
                      {categoryLabel(code)}
                    </span>
                  ))}
                  {p.discountPercent > 0 && (
                    <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">
                      -{p.discountPercent}%
                    </span>
                  )}
                </div>
              </div>
              {/* Pieces left. A package shows its designs added up, since the
                  package's own number stopped meaning anything once each design
                  started carrying its own. Hidden entirely when nothing is
                  tracked yet, rather than showing a misleading 0. */}
              {stock != null && (
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    title={t("dash.fieldStock")}
                    className={`rounded-lg px-2 py-1 text-xs font-black tabular-nums ${
                      empty || designsOut > 0
                        ? "bg-red-500/10 text-red-500"
                        : stock < LOW_STOCK_BELOW || designsLow > 0
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-surface-2 text-ink-2"
                    }`}
                  >
                    {stock}
                  </span>
                  {(designsOut > 0 || designsLow > 0) && (
                    <span className="flex gap-1 text-[10px] font-bold tabular-nums">
                      {designsOut > 0 && (
                        <span
                          title={t("dash.designsOutTitle")}
                          className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-red-500"
                        >
                          {designsOut} {t("dash.designsOut")}
                        </span>
                      )}
                      {designsLow > 0 && (
                        <span
                          title={t("dash.designsLowTitle")}
                          className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-amber-600"
                        >
                          {designsLow} {t("dash.designsLow")}
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
              <span className="shrink-0 text-sm font-extrabold" style={{ color: p.color }}>
                {formatPrice(effectivePrice(p), lang)}
              </span>
              <button
                type="button"
                onClick={() => setEditing(p)}
                aria-label={t("dash.editProduct")}
                className="tap grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                aria-label={isActive ? t("dash.active") : t("dash.inactive")}
                onClick={() => toggleActive(p.id, isActive)}
                className={`tap relative ms-1 h-6 w-11 shrink-0 rounded-full transition ${
                  isActive ? "bg-emerald-500" : "bg-surface-3"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    isActive ? "start-[22px]" : "start-0.5"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>

      <div ref={sentinelRef} className="p-4 text-center text-xs font-semibold text-ink-3">
        {list.length === 0
          ? filter
            ? // "nothing is empty" is good news and must not read as "failed to
              // load" — the ordinary empty-list wording did exactly that.
              t(filter === "out" ? "dash.noneOut" : "dash.noneLow")
            : t("dash.empty")
          : hasMore
            ? t("dash.loadingMore")
            : t("dash.allLoaded")}
      </div>

      <ProductEditorModal
        open={modalOpen || editing !== null}
        product={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={(created) => {
          // Optimistically show a newly-created product at the top instantly;
          // the editor also calls router.refresh() to reconcile with the DB.
          if (created) setList((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
          // A save can zero a design or refill one, so the chips are re-read
          // rather than left showing the shelf as it was when the page opened.
          refreshCounts();
        }}
        onDeleted={(id) => {
          setList((prev) => prev.filter((p) => p.id !== id));
          refreshCounts();
        }}
      />
    </section>
  );
}
