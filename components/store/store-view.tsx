"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { CategoryChips } from "@/components/ui/category-chips";
import { ProductCard } from "@/components/ui/product-card";
import { CustomOrderCard } from "@/components/store/custom-order-card";
import { FilterPanel } from "@/components/store/filter-panel";
import { ProductEditorModal } from "@/components/dashboard/product-editor-modal";
import { FilterManagerModal } from "@/components/store/filter-manager-modal";
import { Search, Sliders, X, ChevronEnd, Plus, Check } from "@/components/icons";
import { MAX_PRICE, lowestPrice, type Fandom } from "@/lib/products";
import { fuzzyMatch } from "@/lib/search";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

export function StoreView() {
  const { t, lang, products, subcategories } = useStore();
  const { isAdmin, ready } = useAuth();
  const router = useRouter();
  // Read from the URL here (not on the server) so /store stays prerenderable.
  const searchParams = useSearchParams();
  const catParam = searchParams.get("cat")?.trim() || "all";

  const [addOpen, setAddOpen] = useState(false);
  const [filtersManagerOpen, setFiltersManagerOpen] = useState(false);
  const [category, setCategory] = useState<CatSel>(catParam);

  // Follow later URL changes (e.g. a category link elsewhere on the site).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCategory(catParam);
  }, [catParam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [subcategory, setSubcategory] = useState<string>("all");
  const [fandom, setFandom] = useState<FandomSel>("all");
  const [waterproof, setWaterproof] = useState(false);
  const [maxPrice, setMaxPrice] = useState(MAX_PRICE);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [page, setPage] = useState(1);

  // DB-side typo-tolerant match ids (Postgres pg_trgm). Augments the instant
  // client fuzzy match so nothing is ever slower or missing — the client result
  // shows immediately and the RPC fills in extra matches when it returns.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [dbMatchIds, setDbMatchIds] = useState<Set<string> | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = search.trim();
    setDbMatchIds(null); // reset instantly; client fuzzy covers the gap
    if (q.length < 2) return;
    let active = true;
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc("search_products", { search_term: q });
      if (!active || error || !data) return;
      setDbMatchIds(new Set((data as { id: string }[]).map((r) => r.id)));
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [search, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const PAGE_SIZE = 8;

  const hasActiveFilters =
    fandom !== "all" || waterproof || maxPrice < MAX_PRICE;

  function clearFilters() {
    setFandom("all");
    setWaterproof(false);
    setMaxPrice(MAX_PRICE);
  }

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = products.filter((p) => {
      if (category !== "all" && !p.categories.includes(category) && p.category !== category)
        return false;
      if (subcategory !== "all" && !p.subcategories.includes(subcategory)) return false;
      if (fandom !== "all" && !p.fandoms.includes(fandom)) return false;
      if (waterproof && !p.waterproof) return false;
      if (lowestPrice(p) > maxPrice) return false;
      if (q) {
        // Match if EITHER the instant client fuzzy matcher OR the Postgres
        // trigram RPC accepts it — the DB catches typos the client misses.
        const haystack = `${p.nameAr} ${p.nameEn} ${p.subAr} ${p.subEn} ${p.tags.join(" ")}`;
        if (!fuzzyMatch(q, haystack) && !dbMatchIds?.has(p.id)) return false;
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
          // "Popular" = the admin's curated ordering (sort_order desc).
          return b.order - a.order;
      }
    });
    return list;
  }, [products, category, subcategory, fandom, waterproof, maxPrice, search, sort, dbMatchIds]);

  // Subcategories of the active category (all of them on the "all" tab).
  const visibleSubs = useMemo(
    () => subcategories.filter((s) => category === "all" || s.categoryCode === category),
    [subcategories, category],
  );
  const activeSub = visibleSubs.find((s) => s.code === subcategory);
  const activeSubLabel = activeSub ? (lang === "ar" ? activeSub.nameAr : activeSub.nameEn) : null;

  // A subcategory only makes sense under its parent — drop it when the
  // category changes or the chosen one is no longer on offer.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (subcategory !== "all" && !visibleSubs.some((s) => s.code === subcategory)) {
      setSubcategory("all");
    }
  }, [visibleSubs, subcategory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset to first page whenever the result set changes.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPage(1);
    setSubMenuOpen(false);
  }, [category, subcategory, fandom, waterproof, maxPrice, search, sort]);
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

      {/* Admin shortcuts — two equal buttons on phones, inline-right on desktop */}
      {ready && isAdmin && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="tap flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand-soft px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand hover:text-white"
          >
            <Plus size={17} />
            {t("dash.newProduct")}
          </button>
          <button
            type="button"
            onClick={() => setFiltersManagerOpen(true)}
            className="tap flex items-center justify-center gap-2 rounded-xl border border-dashed border-brand/50 bg-brand-soft px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand hover:text-white"
          >
            <Sliders size={17} />
            {t("store.manageFilters")}
          </button>
        </div>
      )}

      {/* Category chips */}
      <div className="mt-4">
        <CategoryChips active={category} onSelect={setCategory} />
      </div>

      {/* Subcategory — the third filter, as a dropdown attached under the
          category chips. Only appears for a category that has subfilters; the
          + button reveals them, and a small note explains it. */}
      {visibleSubs.length > 0 && (
        <div className="mt-3">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setSubMenuOpen((v) => !v)}
              aria-expanded={subMenuOpen}
              className={`tap inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${
                subcategory !== "all" || subMenuOpen
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
              }`}
            >
              <Plus
                size={15}
                className={`transition-transform duration-200 ${subMenuOpen ? "rotate-45" : ""}`}
              />
              {activeSubLabel ?? t("store.subcategory")}
              {subcategory !== "all" && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
            </button>

            {subMenuOpen && (
              <>
                {/* click-away layer */}
                <button
                  type="button"
                  aria-hidden
                  tabIndex={-1}
                  onClick={() => setSubMenuOpen(false)}
                  className="fixed inset-0 z-20 cursor-default"
                />
                <div className="absolute z-30 mt-2 max-h-64 min-w-[210px] animate-pop overflow-y-auto rounded-xl border border-line-2 bg-surface p-1.5 shadow-2xl">
                  <SubItem
                    label={t("cat.all")}
                    on={subcategory === "all"}
                    onClick={() => {
                      setSubcategory("all");
                      setSubMenuOpen(false);
                    }}
                  />
                  {visibleSubs.map((s) => (
                    <SubItem
                      key={s.code}
                      label={lang === "ar" ? s.nameAr : s.nameEn}
                      on={subcategory === s.code}
                      onClick={() => {
                        setSubcategory(s.code);
                        setSubMenuOpen(false);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-3">{t("store.subHint")}</p>
        </div>
      )}

      {/* Result count */}
      <p className="mt-4 text-xs font-semibold text-ink-3">
        {filtered.length} {t("store.results")}
      </p>

      {/* Content */}
      <div className="mt-3 flex gap-5">
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border border-dashed border-line bg-surface py-20 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
                <Search size={26} />
              </span>
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

      {ready && isAdmin && (
        <>
          <ProductEditorModal
            open={addOpen}
            onClose={() => setAddOpen(false)}
            onSaved={() => router.refresh()}
          />
          <FilterManagerModal
            open={filtersManagerOpen}
            onClose={() => setFiltersManagerOpen(false)}
          />
        </>
      )}
    </div>
  );
}

/** One row in the subcategory dropdown. */
function SubItem({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs font-bold transition ${
        on ? "bg-brand text-white" : "text-ink-2 hover:bg-surface-2 hover:text-brand"
      }`}
    >
      {label}
      {on && <Check size={14} className="shrink-0" />}
    </button>
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
