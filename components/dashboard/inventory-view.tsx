"use client";

import { useMemo, useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { ProductMedia } from "@/components/ui/product-media";
import { ProductEditorModal } from "@/components/dashboard/product-editor-modal";
import { Pencil } from "@/components/dashboard/dash-icons";
import { Plus } from "@/components/icons";
import { formatPrice } from "@/lib/format";
import { LOW_STOCK_AT, effectivePrice, totalStockFor, type Product } from "@/lib/products";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import { setProductActiveAction, loadMoreInventoryAction } from "@/lib/actions/products";

export function InventoryView({
  initialProducts,
  initialHasMore,
}: {
  initialProducts: Product[];
  initialHasMore: boolean;
}) {
  const { t, lang, categoryLabel } = useStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [, startTransition] = useTransition();

  const {
    items: list,
    hasMore,
    sentinelRef,
    setItems: setList,
  } = usePaginatedList(initialProducts, initialHasMore, async (offset) => {
    const page = await loadMoreInventoryAction(offset);
    return { items: page.products, hasMore: page.hasMore };
  });

  // Counted over what's loaded, not the whole catalogue: the list pages in on
  // scroll, and pretending to a total we haven't fetched would be a lie that
  // changes as you scroll. The overview's KPI card is the whole-catalogue count.
  const emptyCount = useMemo(() => list.filter((p) => totalStockFor(p) === 0).length, [list]);
  const shown = useMemo(
    () => (emptyOnly ? list.filter((p) => totalStockFor(p) === 0) : list),
    [list, emptyOnly],
  );

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
        <div className="flex items-center gap-2">
          {/* Filters what's already loaded. The list pages in as you scroll, so
              with the filter on, keep scrolling to pull in more — the counter
              beside it says how many of the loaded ones are empty. */}
          <button
            type="button"
            aria-pressed={emptyOnly}
            onClick={() => setEmptyOnly((v) => !v)}
            className={`tap inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
              emptyOnly
                ? "border-red-500 bg-red-500/10 text-red-500"
                : "border-line text-ink-2 hover:border-brand hover:text-brand"
            }`}
          >
            {t("dash.outOfStock")}
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                emptyOnly ? "bg-red-500/15" : "bg-surface-2 text-ink-3"
              }`}
            >
              {emptyCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="tap inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
          >
            <Plus size={16} />
            {t("dash.addProduct")}
          </button>
        </div>
      </div>

      <ul className="divide-y divide-line-2">
        {shown.map((p) => {
          const name = lang === "ar" ? p.nameAr : p.nameEn;
          const isActive = p.isActive !== false;
          const stock = totalStockFor(p);
          const empty = stock === 0;
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
                <span
                  title={t("dash.fieldStock")}
                  className={`shrink-0 rounded-lg px-2 py-1 text-xs font-black tabular-nums ${
                    empty
                      ? "bg-red-500/10 text-red-500"
                      : stock <= LOW_STOCK_AT
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-surface-2 text-ink-2"
                  }`}
                >
                  {stock}
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
        {list.length === 0 ? t("dash.empty") : hasMore ? t("dash.loadingMore") : t("dash.allLoaded")}
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
        }}
        onDeleted={(id) => setList((prev) => prev.filter((p) => p.id !== id))}
      />
    </section>
  );
}
