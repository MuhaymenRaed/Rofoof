"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/components/providers/store-provider";
import { CategoryChips } from "@/components/ui/category-chips";
import { ProductCard } from "@/components/ui/product-card";
import { CustomOrderCard } from "@/components/store/custom-order-card";
import { FilterPanel } from "@/components/store/filter-panel";
import { Search, Sliders, X, ChevronEnd } from "@/components/icons";
import { MAX_PRICE, lowestPrice, type Fandom } from "@/lib/products";
import type { DictKey } from "@/lib/i18n";

type CatSel = string;
type FandomSel = Fandom | "all";
type Sort = "popular" | "priceAsc" | "priceDesc" | "newest";

const SORT_OPTIONS: { id: Sort; key: DictKey }[] = [
  { id: "popular", key: "sort.popular" },
  { id: "newest", key: "sort.newest" },
  { id: "priceAsc", key: "sort.priceAsc" },
  { id: "priceDesc", key: "sort.priceDesc" },
];

export function StoreView({ initialCategory = "all" }: { initialCategory?: CatSel }) {
  const { t, products } = useStore();

  const [category, setCategory] = useState<CatSel>(initialCategory);
  const [fandom, setFandom] = useState<FandomSel>("all");
  const [waterproof, setWaterproof] = useState(false);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 8;

  const hasActiveFilters =
    fandom !== "all" || waterproof || maxPrice < MAX_PRICE;

  function clearFilters() {
    setFandom("all");
    setWaterproof(false);
    setMaxPrice(MAX_PRICE);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = products.filter((p) => {
      if (category !== "all" && !p.categories.includes(category) && p.category !== category)
        return false;
      if (fandom !== "all" && !p.fandoms.includes(fandom)) return false;
      if (waterproof && !p.waterproof) return false;
      if (lowestPrice(p) > maxPrice) return false;
      if (q) {
        const haystack = `${p.nameAr} ${p.nameEn} ${p.subAr} ${p.subEn} ${p.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "priceAsc":
          return lowestPrice(a) - lowestPrice(b);
        case "priceDesc":
          return lowestPrice(b) - lowestPrice(a);
        case "newest":
          return b.order - a.order;
        default:
          return b.reviews - a.reviews;
      }
    });
    return list;
  }, [products, category, fandom, waterproof, maxPrice, search, sort]);

  // Reset to first page whenever the result set changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPage(1);
  }, [category, fandom, waterproof, maxPrice, search, sort]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageItems = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-ink-3">
            <Search size={17} />
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label={t("aria.close")}
              className="tap absolute inset-y-0 end-3 grid place-items-center text-ink-3 hover:text-brand"
            >
              <X size={15} />
            </button>
          )}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("store.searchPlaceholder")}
            aria-label={t("store.searchPlaceholder")}
            className="h-11 w-full rounded-xl border border-line bg-surface ps-10 pe-9 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand"
          />
        </div>

        {/* Sort */}
        <label className="relative">
          <span className="sr-only">{t("store.sort")}</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="tap h-11 cursor-pointer appearance-none rounded-xl border border-line bg-surface ps-4 pe-9 text-sm font-semibold text-ink-2 outline-none transition hover:border-brand focus:border-brand"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {t(o.key)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-ink-3">
            ▾
          </span>
        </label>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`tap flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold transition ${
            filtersOpen || hasActiveFilters
              ? "border-brand bg-brand-soft text-brand"
              : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
          }`}
        >
          <Sliders size={17} />
          {t("store.filter")}
          {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
        </button>
      </div>

      {/* Category chips */}
      <div className="mt-4">
        <CategoryChips active={category} onSelect={setCategory} />
      </div>

      {/* Result count */}
      <p className="mt-4 text-xs font-semibold text-ink-3">
        {filtered.length} {t("store.results")}
      </p>

      {/* Content */}
      <div className="mt-3 flex gap-5">
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center">
              <p className="text-3xl">🔍</p>
              <p className="mt-3 font-bold text-ink">{t("store.empty")}</p>
              <p className="mt-1 text-sm text-ink-3">{t("store.emptyHint")}</p>
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  setSearch("");
                  setCategory("all");
                }}
                className="tap mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                {t("store.clear")}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                {current === 1 && <CustomOrderCard />}
                {pageItems.map((p, i) => (
                  <ProductCard key={p.id} product={p} priority={current === 1 && i < 2} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  current={current}
                  totalPages={totalPages}
                  onChange={setPage}
                  prevLabel={t("store.prev")}
                  nextLabel={t("store.next")}
                />
              )}
            </>
          )}
        </div>

        {/* Backdrop (mobile) */}
        {filtersOpen && (
          <div
            onClick={() => setFiltersOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          />
        )}

        {/* Filter panel: inline column on lg, slide-over on mobile */}
        <aside
          className={`fixed inset-y-0 end-0 z-40 w-80 max-w-[85%] overflow-y-auto bg-surface p-5 shadow-2xl transition-transform duration-300 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:shrink-0 lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none ${
            filtersOpen
              ? "translate-x-0 lg:block"
              : "ltr:translate-x-full rtl:-translate-x-full lg:hidden"
          }`}
        >
          <div className="lg:sticky lg:top-24">
            <FilterPanel
              fandom={fandom}
              waterproof={waterproof}
              maxPrice={maxPrice}
              onFandom={setFandom}
              onWaterproof={setWaterproof}
              onMaxPrice={setMaxPrice}
              onClear={clearFilters}
              onClose={() => setFiltersOpen(false)}
              hasActive={hasActiveFilters}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Pagination({
  current,
  totalPages,
  onChange,
  prevLabel,
  nextLabel,
}: {
  current: number;
  totalPages: number;
  onChange: (page: number) => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - current) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  const btn =
    "tap grid h-9 min-w-9 place-items-center rounded-lg border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="pagination">
      <button
        type="button"
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className={`${btn} border-line bg-surface text-ink-2 hover:border-brand hover:text-brand`}
        aria-label={prevLabel}
      >
        <span className="rtl:rotate-180">
          <ChevronEnd size={16} />
        </span>
      </button>

      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-ink-3">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === current ? "page" : undefined}
            className={`${btn} ${
              p === current
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(current + 1)}
        disabled={current === totalPages}
        className={`${btn} border-line bg-surface text-ink-2 hover:border-brand hover:text-brand`}
        aria-label={nextLabel}
      >
        <span className="ltr:rotate-180">
          <ChevronEnd size={16} />
        </span>
      </button>
    </nav>
  );
}
