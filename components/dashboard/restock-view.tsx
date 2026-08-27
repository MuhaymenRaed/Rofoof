"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { RetryImage } from "@/components/ui/retry-image";
import { Pencil } from "@/components/dashboard/dash-icons";
import { Search, X, ChevronDown } from "@/components/icons";
import { Dropdown } from "@/components/ui/dropdown";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import { splitCategoryGroups, type ProductKind } from "@/lib/products";
import {
  loadMoreRestockQueueAction,
  applyRestockAction,
  dismissRestockAction,
  setRestockBlacklistAction,
} from "@/lib/actions/restock";
import type {
  RestockFailure,
  RestockFilters,
  RestockQueueItem,
  RestockSort,
} from "@/lib/data/restock";
import type { DictKey } from "@/lib/i18n";
import { RestockDetailModal } from "@/components/dashboard/restock-detail-modal";

const SORTS: { id: RestockSort; key: DictKey }[] = [
  { id: "demand_desc", key: "restock.sortDemand" },
  { id: "date_desc", key: "restock.sortDateNew" },
  { id: "date_asc", key: "restock.sortDateOld" },
  { id: "orders_desc", key: "restock.sortOrdersDesc" },
  { id: "orders_asc", key: "restock.sortOrdersAsc" },
];

const KINDS: { id: ProductKind | null; key: DictKey }[] = [
  { id: null, key: "cat.all" },
  { id: "standard", key: "dash.kind.standard" },
  { id: "package", key: "dash.kind.package" },
  { id: "tiered", key: "dash.kind.tiered" },
];

/** A stable key for the filter combo, so the seed-refetch effect has one clean dependency. */
function filterKey(f: RestockFilters): string {
  return JSON.stringify([f.search ?? "", [...(f.categories ?? [])].sort(), f.kind ?? "", f.sort]);
}

export function RestockView({
  initialItems,
  initialHasMore,
  initialFailure = null,
}: {
  initialItems: RestockQueueItem[];
  initialHasMore: boolean;
  /** Why the list is empty, when it is empty for a reason worth showing. */
  initialFailure?: RestockFailure | null;
}) {
  const { t, lang, categories } = useStore();
  const { types: typeCats, themes: themeCats } = useMemo(
    () => splitCategoryGroups(categories),
    [categories],
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [kind, setKind] = useState<ProductKind | null>(null);
  const [sort, setSort] = useState<RestockSort>("demand_desc");
  const [detail, setDetail] = useState<{ productId: string; itemId: string | null } | null>(null);

  // Debounce the search box — everything else applies instantly.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filters: RestockFilters = useMemo(
    () => ({ search, categories: selectedCategories, kind, sort }),
    [search, selectedCategories, kind, sort],
  );

  // The hook re-seeds from these whenever they change (see use-paginated-list.ts),
  // so a filter/search/sort change re-fetches page 0 from the server and the
  // hook's own infinite scroll picks up from there for later pages.
  const [seedItems, setSeedItems] = useState(initialItems);
  const [seedHasMore, setSeedHasMore] = useState(initialHasMore);
  const [failure, setFailure] = useState<RestockFailure | null>(initialFailure);
  const [, startTransition] = useTransition();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let active = true;
    startTransition(async () => {
      const page = await loadMoreRestockQueueAction(0, filters);
      if (active) {
        setSeedItems(page.items);
        setSeedHasMore(page.hasMore);
        setFailure(page.failure ?? null);
      }
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey(filters)]);

  const {
    items: list,
    hasMore,
    sentinelRef,
    setItems: setList,
  } = usePaginatedList(seedItems, seedHasMore, async (offset) => {
    const page = await loadMoreRestockQueueAction(offset, filters);
    return { items: page.items, hasMore: page.hasMore };
  });

  /**
   * The muted list, fetched HERE rather than inside the collapsed section it
   * belongs to — because its count has to be known while that section is still
   * shut. A sale on a muted row is otherwise completely invisible: the queue
   * says "nothing needs restocking 🎉" and the silent "not tracked" header
   * below it gives no hint that the sale landed in there.
   *
   * `mutedVersion` is bumped by every action that resolves a row, so muting
   * something from the queue lands in this list straight away instead of on
   * the next full reload.
   */
  const [muted, setMuted] = useState<{ items: RestockQueueItem[] | null; hasMore: boolean }>({
    items: null,
    hasMore: false,
  });
  const [mutedVersion, setMutedVersion] = useState(0);
  useEffect(() => {
    let active = true;
    startTransition(async () => {
      const page = await loadMoreRestockQueueAction(0, { ...filters, blacklisted: true });
      if (active) setMuted({ items: page.items, hasMore: page.hasMore });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey(filters), mutedVersion]);

  /** Muted rows that have sold since their last restock — the ones worth a badge. */
  const mutedPending = (muted.items ?? []).filter((r) => r.soldSinceRestock > 0).length;

  function resolveRow(productId: string, itemId: string | null) {
    setList((prev) => prev.filter((r) => !(r.productId === productId && r.itemId === itemId)));
    setMutedVersion((v) => v + 1);
  }

  function loadMoreMuted() {
    startTransition(async () => {
      const page = await loadMoreRestockQueueAction(muted.items?.length ?? 0, {
        ...filters,
        blacklisted: true,
      });
      setMuted((prev) => ({
        items: [...(prev.items ?? []), ...page.items],
        hasMore: page.hasMore,
      }));
    });
  }

  /**
   * Un-mute a row: take it out of the muted list and, when it has demand
   * waiting, hand it straight to the queue above.
   *
   * That second half is not a nicety. The server revalidates, but this list is
   * seeded into state once and never re-reads its props, so an un-muted row
   * with pending sales went nowhere the admin could see until a full page
   * reload — which is indistinguishable from the button doing nothing.
   */
  function untrack(row: RestockQueueItem) {
    setMuted((prev) => ({
      ...prev,
      items: (prev.items ?? []).filter(
        (r) => !(r.productId === row.productId && r.itemId === row.itemId),
      ),
    }));
    if (row.soldSinceRestock <= 0) return;
    setList((prev) =>
      prev.some((r) => r.productId === row.productId && r.itemId === row.itemId)
        ? prev
        : [{ ...row, blacklisted: false }, ...prev],
    );
  }

  function toggleCategory(code: string) {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  /** Clear one box's chips, leaving the other box's selection alone. */
  function clearGroup(codes: string[]) {
    setSelectedCategories((prev) => prev.filter((c) => !codes.includes(c)));
  }

  return (
    <section className="rounded-2xl border border-line-2 bg-surface card-shadow">
      <div className="border-b border-line-2 p-5">
        {/* Title and sort. The sort control is full-width on a phone, where a
            shrink-to-fit button beside a two-line heading reads as an
            afterthought, and sits inline from `sm:` up. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-ink">{t("dash.restock")}</h2>
            <p className="mt-0.5 text-[11px] text-ink-3">{t("restock.subtitle")}</p>
          </div>
          <Dropdown
            value={sort}
            onChange={setSort}
            label={t("restock.sortLabel")}
            options={SORTS.map((s) => ({ value: s.id, label: t(s.key) }))}
            className="w-full shrink-0 sm:w-52"
          />
        </div>

        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("restock.searchPlaceholder")}
            className="dash-input w-full ps-9"
          />
        </div>

        {/* The three filter groups, each in its own labelled box: what the
            thing IS (product kind), what it IS (category type) and what it is
            ABOUT (theme) are three different questions, and a single flat run
            of chips made them look like one list where picking two neighbours
            might mean anything. One column on a phone, two from `sm:` up. */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <FilterBox title={t("restock.kindFilter")}>
            {KINDS.map((k) => (
              <Chip
                key={k.id ?? "all"}
                label={t(k.key)}
                active={kind === k.id}
                onClick={() => setKind(k.id)}
              />
            ))}
          </FilterBox>

          {typeCats.length > 0 && (
            <FilterBox
              title={t("store.groupType")}
              onClear={
                typeCats.some((c) => selectedCategories.includes(c.code))
                  ? () => clearGroup(typeCats.map((c) => c.code))
                  : undefined
              }
              clearLabel={t("cat.all")}
            >
              {typeCats.map((c) => (
                <Chip
                  key={c.code}
                  label={lang === "ar" ? c.nameAr : c.nameEn}
                  active={selectedCategories.includes(c.code)}
                  onClick={() => toggleCategory(c.code)}
                />
              ))}
            </FilterBox>
          )}

          {themeCats.length > 0 && (
            <FilterBox
              title={t("store.groupTheme")}
              onClear={
                themeCats.some((c) => selectedCategories.includes(c.code))
                  ? () => clearGroup(themeCats.map((c) => c.code))
                  : undefined
              }
              clearLabel={t("cat.all")}
              // The theme list is the long one; on a two-column row it gets
              // the full width so its chips wrap into a block rather than a
              // narrow ribbon beside a half-empty box.
              className="sm:col-span-2"
            >
              {themeCats.map((c) => (
                <Chip
                  key={c.code}
                  label={lang === "ar" ? c.nameAr : c.nameEn}
                  active={selectedCategories.includes(c.code)}
                  onClick={() => toggleCategory(c.code)}
                />
              ))}
            </FilterBox>
          )}
        </div>
      </div>

      <ul className="divide-y divide-line-2">
        {list.map((row) => (
          <RestockRow
            key={`${row.productId}:${row.itemId ?? ""}`}
            row={row}
            onResolved={() => resolveRow(row.productId, row.itemId)}
            onOpenDetail={() => setDetail({ productId: row.productId, itemId: row.itemId })}
          />
        ))}
      </ul>

      <div ref={sentinelRef} className="p-4 text-center text-xs font-semibold text-ink-3">
        {list.length === 0 && failure ? (
          // An empty list with a reason. Never the celebratory empty state —
          // "nothing needs restocking" is a claim about the shop, and it must
          // not be made on the strength of a query that failed.
          <div className="py-6">
            <p className="text-sm font-extrabold text-red-500">{t("restock.loadFailed")}</p>
            <p className="mt-1 text-[11px] text-ink-3">
              {failure.kind === "migration" ? t("restock.needsMigration") : failure.message}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="py-6">
            <p className="text-sm font-extrabold text-ink">{t("restock.emptyQueue")}</p>
            {/* The queue really is empty — but "nothing needs restocking" is
                only half true while a muted row has sales on it, so say where
                they went rather than leaving the admin to find them. */}
            <p className="mt-1 text-[11px] text-ink-3">
              {mutedPending > 0 ? t("restock.emptyButMuted") : t("restock.emptyQueueHint")}
            </p>
          </div>
        ) : hasMore ? (
          t("dash.loadingMore")
        ) : (
          t("dash.allLoaded")
        )}
      </div>

      <BlacklistSection
        items={muted.items}
        hasMore={muted.hasMore}
        pendingCount={mutedPending}
        onLoadMore={loadMoreMuted}
        onUntrack={untrack}
      />

      {detail && (
        <RestockDetailModal
          productId={detail.productId}
          itemId={detail.itemId}
          onClose={() => setDetail(null)}
          onResolved={() => {
            resolveRow(detail.productId, detail.itemId);
            setDetail(null);
          }}
        />
      )}
    </section>
  );
}

/** One labelled group of filter chips. */
function FilterBox({
  title,
  children,
  onClear,
  clearLabel,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  /** Omitted when the group has nothing selected — nothing to clear. */
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-line-2 bg-surface-2/40 p-2.5 ${className}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3">{title}</span>
        {onClear && clearLabel && (
          <button
            type="button"
            onClick={onClear}
            className="tap rounded-md px-1.5 py-0.5 text-[10px] font-bold text-ink-3 transition hover:bg-surface-2 hover:text-brand"
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`tap rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
        active
          ? "border-brand bg-brand-soft text-brand"
          : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
      }`}
    >
      {label}
    </button>
  );
}

function RestockRow({
  row,
  onResolved,
  onOpenDetail,
}: {
  row: RestockQueueItem;
  onResolved: () => void;
  onOpenDetail: () => void;
}) {
  const { t, lang, categoryLabel } = useStore();
  const [customOpen, setCustomOpen] = useState(false);
  const [customQty, setCustomQty] = useState(row.soldSinceRestock || 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const name = lang === "ar" ? row.nameAr : row.nameEn;
  const itemName = row.itemId
    ? lang === "ar"
      ? row.itemNameAr || row.nameAr
      : row.itemNameEn || row.nameEn
    : null;

  /**
   * Every one of these three buttons removes the row on success — so a failure
   * that removed nothing and said nothing was indistinguishable from a button
   * that didn't register the tap. The row stays put and states the reason
   * instead, and names the migration when that's what it is, since that one the
   * admin can actually fix.
   */
  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        onResolved();
        return;
      }
      setError(
        res.error === "migration" ? t("restock.needsMigration") : t("restock.actionFailed"),
      );
    });
  }

  function restock(qty: number) {
    run(() => applyRestockAction({ productId: row.productId, itemId: row.itemId, qty }));
  }

  /** Leave the shelf alone; the row comes back by itself on the next sale. */
  function discard() {
    run(() => dismissRestockAction({ productId: row.productId, itemId: row.itemId }));
  }

  function blacklist() {
    if (!window.confirm(t("restock.blacklistConfirm"))) return;
    run(() =>
      setRestockBlacklistAction({
        productId: row.productId,
        itemId: row.itemId,
        blacklisted: true,
      }),
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-3 p-4 sm:px-5">
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={t("restock.viewDetails")}
        className="tap flex min-w-0 flex-1 items-center gap-3 text-start"
      >
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
          {row.imageUrl && (
            <RetryImage
              src={row.imageUrl}
              alt={itemName ?? name}
              fill
              sizes="48px"
              className="object-cover"
            />
          )}
        </span>
        <span className="min-w-0">
          {/* Name and the count sold, together on the headline — "ستكرات ×5"
              is the whole question this row answers, and burying the number in
              a chip below meant reading two lines to learn one thing. `dir=ltr`
              on the ×N so the multiplication sign stays glued to its digits in
              an RTL line. */}
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold text-ink">
              {itemName ? `${name} — ${itemName}` : name}
            </span>
            <span dir="ltr" className="shrink-0 text-[13px] font-black text-brand">
              ×{row.soldSinceRestock}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3">
              {categoryLabel(row.categoryCode)}
            </span>
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-600">
              {t("restock.soldSince")}: {row.soldSinceRestock}
            </span>
            <span className="text-[10px] font-bold text-ink-3">
              {t("dash.fieldStock")}: {row.stock}
            </span>
            {/* Only a row that was discarded and has SINCE sold again can be
                here carrying a discard date — the count below it is what came
                in after that day. */}
            {row.dismissedAt && (
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3">
                {t("restock.discardedOn")} {row.dismissedAt.slice(0, 10)}
              </span>
            )}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {customOpen ? (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              autoFocus
              value={customQty}
              onChange={(e) => setCustomQty(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
              aria-label={t("restock.customAmount")}
              className="dash-input h-8 w-20 px-2 py-1 text-center text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => restock(customQty)}
              className="tap rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t("restock.confirmRestock")}
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
              aria-label={t("dash.cancel")}
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => restock(row.soldSinceRestock)}
              className="tap rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t("restock.addToStock")} +{row.soldSinceRestock}
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomQty(row.soldSinceRestock || 1);
                setCustomOpen(true);
              }}
              aria-label={t("restock.customAmount")}
              title={t("restock.customAmount")}
              className="tap grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-brand hover:text-brand"
            >
              <Pencil size={13} />
            </button>
            {/* Spelled out rather than given an icon, and no confirm dialog:
                the difference from the ✕ beside it is entirely in what it
                MEANS, which no glyph carries, and it is the harmless one of
                the pair — nothing is lost if it is tapped by mistake. */}
            <button
              type="button"
              disabled={pending}
              onClick={discard}
              title={t("restock.discardHint")}
              className="tap rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {t("restock.discard")}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={blacklist}
              title={t("restock.blacklist")}
              aria-label={t("restock.blacklist")}
              className="tap grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-2 transition hover:border-red-500 hover:text-red-500 disabled:opacity-50"
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* `w-full` inside the wrapping row: its own line, under everything. */}
      {error && <p className="w-full text-[11px] font-bold text-red-500">{error}</p>}
    </li>
  );
}

function BlacklistSection({
  items,
  hasMore,
  pendingCount,
  onLoadMore,
  onUntrack,
}: {
  /** null while the first page is still in flight. */
  items: RestockQueueItem[] | null;
  hasMore: boolean;
  /** Muted rows with sales waiting on them — 0 hides the badge entirely. */
  pendingCount: number;
  onLoadMore: () => void;
  onUntrack: (row: RestockQueueItem) => void;
}) {
  const { t, lang, categoryLabel } = useStore();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function unblacklist(row: RestockQueueItem) {
    startTransition(async () => {
      const res = await setRestockBlacklistAction({
        productId: row.productId,
        itemId: row.itemId,
        blacklisted: false,
      });
      if (res.ok) onUntrack(row);
    });
  }

  return (
    <div className="border-t border-line-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap flex w-full items-center justify-between px-5 py-3 text-xs font-bold text-ink-2 transition hover:text-ink"
      >
        {/* The badge is the whole reason this list loads before it is opened:
            shut and silent, this header is where a sale on a muted row goes to
            disappear. `+` when there are more pages than the one counted. */}
        <span className="flex items-center gap-2">
          {t("restock.blacklistedSection")}
          {pendingCount > 0 && (
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-600">
              {pendingCount}
              {hasMore ? "+" : ""} {t("restock.soldUnits")}
            </span>
          )}
        </span>
        <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="divide-y divide-line-2 border-t border-line-2">
          {items === null && (
            <li className="p-5 text-center text-[11px] text-ink-3">{t("dash.loadingMore")}</li>
          )}
          {items !== null && items.length === 0 && (
            <li className="p-5 text-center text-[11px] text-ink-3">{t("restock.blacklistedEmpty")}</li>
          )}
          {(items ?? []).map((row) => {
            const name = lang === "ar" ? row.nameAr : row.nameEn;
            const itemName = row.itemId
              ? lang === "ar"
                ? row.itemNameAr || row.nameAr
                : row.itemNameEn || row.nameEn
              : null;
            return (
              <li
                key={`${row.productId}:${row.itemId ?? ""}`}
                className="flex items-center gap-3 p-4 sm:px-5"
              >
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                  {row.imageUrl && (
                    <RetryImage src={row.imageUrl} alt={itemName ?? name} fill sizes="40px" className="object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-ink">
                    {itemName ? `${name} — ${itemName}` : name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-ink-3">
                      {categoryLabel(row.categoryCode)}
                    </span>
                    {/* Which of the muted rows actually sold, and how much. */}
                    {row.soldSinceRestock > 0 && (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-black text-amber-600">
                        {t("restock.soldSince")}: {row.soldSinceRestock}
                      </span>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => unblacklist(row)}
                  className="tap shrink-0 rounded-lg border border-line px-3 py-1.5 text-[11px] font-bold text-ink-2 transition hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  {t("restock.unblacklist")}
                </button>
              </li>
            );
          })}
          {hasMore && (
            <li className="p-3 text-center">
              <button
                type="button"
                disabled={pending}
                onClick={onLoadMore}
                className="tap text-[11px] font-bold text-brand hover:opacity-80 disabled:opacity-50"
              >
                {t("dash.loadingMore")}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
