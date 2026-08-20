"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProductCard } from "@/components/ui/product-card";
import { CustomOrderCard } from "@/components/store/custom-order-card";
import { ManualOrderCard } from "@/components/store/manual-order-card";
import { FilterPanel } from "@/components/store/filter-panel";
import { CategoryFilterGroup } from "@/components/store/category-filter-group";
import { ProductEditorModal } from "@/components/dashboard/product-editor-modal";
import { FilterManagerModal } from "@/components/store/filter-manager-modal";
import { Search, Sliders, X, ChevronEnd, Plus, Package, Heart } from "@/components/icons";
import {
  DEFAULT_MAX_PRICE,
  MAX_PRICE,
  MIN_PRICE,
  lowestPrice,
  splitCategoryGroups,
  type Product,
  type SubcategoryInfo,
} from "@/lib/products";
import { fuzzyMatch } from "@/lib/search";
import { useDebouncedUrlValue } from "@/lib/hooks/use-debounced-url-value";
import {
  parseIntParam,
  parseListParam,
  parseNumberParam,
  toggleInList,
  withParams,
  type ParamValue,
} from "@/lib/url-params";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DictKey } from "@/lib/i18n";

type Sort = "popular" | "priceAsc" | "priceDesc" | "newest";

const SORT_OPTIONS: { id: Sort; key: DictKey }[] = [
  { id: "popular", key: "sort.popular" },
  { id: "newest", key: "sort.newest" },
  { id: "priceAsc", key: "sort.priceAsc" },
  { id: "priceDesc", key: "sort.priceDesc" },
];

const DEFAULT_SORT: Sort = "popular";

/** Rank given to a product with no sales, so it sorts after every ranked one. */
const UNRANKED = Number.MAX_SAFE_INTEGER;

/**
 * The two filter boxes' header glyphs, built once. Inline JSX would be a fresh
 * element on every render, which is exactly the prop that would defeat the
 * memo on CategoryFilterGroup — the one place it matters, since the store
 * re-renders on every keystroke in the search field.
 */
const TYPE_BOX_ICON = <Package size={15} />;
const THEME_BOX_ICON = <Heart size={15} />;

/**
 * Whether a product satisfies ONE of the two category boxes.
 *
 * Inside a box the codes are OR-ed, and each one is either taken whole or
 * narrowed by the subfilters picked under it — so "all of Football" plus "only
 * Hollow Knight from Games" returns every football item AND the Hollow Knight
 * games items, instead of the subfilter wiping out the other chip. A subfilter
 * whose parent chip isn't selected stands on its own.
 *
 * An empty box matches everything, which is what makes "stickers, no theme
 * chosen" mean "every sticker" rather than "nothing".
 *
 * The two boxes are then AND-ed by the caller: that is the whole point of the
 * split. `stickers` × `gaming` reads as "gaming stickers", where one flat chip
 * row could only ever say "stickers or gaming".
 */
function matchesFilterBox(
  p: Pick<Product, "category" | "categories" | "subcategories">,
  activeCodes: string[],
  subsByParent: Map<string, string[]>,
): boolean {
  if (activeCodes.length === 0 && subsByParent.size === 0) return true;

  for (const code of activeCodes) {
    if (!(p.categories.includes(code) || p.category === code)) continue;
    const subs = subsByParent.get(code);
    if (!subs || subs.length === 0) return true;
    if (subs.some((sub) => p.subcategories.includes(sub))) return true;
  }

  for (const [parent, subs] of subsByParent) {
    if (activeCodes.includes(parent)) continue;
    if (subs.some((sub) => p.subcategories.includes(sub))) return true;
  }

  return false;
}

/**
 * The storefront catalogue.
 *
 * Filtering stays 100% client-side (the whole catalogue is already in the store
 * provider), but every SHAREABLE filter lives in the URL rather than in local
 * state — so a link carries the exact view, refresh keeps it, and back/forward
 * work for free. Only genuinely local UI (open dropdown, per-page preference)
 * stays in React state.
 *
 * Categories are shown in two boxes — product type and theme — and every
 * filter group is multi-select: OR within a group, AND across groups. So
 * (stickers OR posters) AND (anime OR games) AND the side panel's fandom,
 * waterproof and price. Results come from a single pass over the unique product
 * list, so an item matching two selected filters still appears exactly once.
 */
export function StoreView({
  popularity = [],
}: {
  /** product ids by units ordered, most first — see getPopularityRanking() */
  popularity?: string[];
}) {
  const { t, lang, products, categories, subcategories, fandoms } = useStore();
  const { isAdmin, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Read from the URL here (not on the server) so /store stays prerenderable.
  const searchParams = useSearchParams();

  const [addOpen, setAddOpen] = useState(false);
  const [filtersManagerOpen, setFiltersManagerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [subMenuFor, setSubMenuFor] = useState<string | null>(null);

  /* ----------------------- filters, derived from the URL ------------------ */

  const knownCategories = useMemo(() => new Set(categories.map((c) => c.code)), [categories]);
  const knownFandoms = useMemo(() => new Set(fandoms.map((f) => f.code)), [fandoms]);

  /**
   * The two filter boxes. Both live in the SAME `category` URL param — the
   * grouping is a property of the taxonomy, not of the link — so every URL
   * shared before the split, every home-page chip and every "show all" rail
   * button keeps working untouched.
   */
  const { types: typeCats, themes: themeCats } = useMemo(
    () => splitCategoryGroups(categories),
    [categories],
  );
  const typeCodes = useMemo(() => new Set(typeCats.map((c) => c.code)), [typeCats]);
  /**
   * Anything that isn't a known product type belongs to the theme box — the
   * same rule defaultCategoryGroup() applies server-side. A code we can't place
   * (an orphaned subfilter, a category deleted mid-session) then still filters,
   * instead of falling between the two boxes and being silently ignored.
   */
  const isTypeCode = useCallback((code: string) => typeCodes.has(code), [typeCodes]);
  /** subcategory code → its parent category code */
  const subParent = useMemo(
    () => new Map(subcategories.map((s) => [s.code, s.categoryCode])),
    [subcategories],
  );

  // `cat` is the legacy single-category param — still honoured so links shared
  // before multi-select (and the home page chips) keep working.
  const activeCategories = useMemo(() => {
    const raw = parseListParam(searchParams.get("category") ?? searchParams.get("cat"));
    // Drop codes that no longer exist instead of showing an empty store.
    return knownCategories.size > 0 ? raw.filter((c) => knownCategories.has(c)) : raw;
  }, [searchParams, knownCategories]);

  // Any KNOWN subcategory counts, even when its parent chip isn't selected —
  // a subfilter can stand on its own (see matchesTaxonomy below).
  const activeSubcategories = useMemo(() => {
    const raw = parseListParam(searchParams.get("subcategory"));
    if (subParent.size === 0) return raw;
    return raw.filter((code) => subParent.has(code));
  }, [searchParams, subParent]);

  /** Selected subcategories bucketed under the category they belong to. */
  const selectedSubsByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const code of activeSubcategories) {
      const parent = subParent.get(code);
      if (!parent) continue;
      const arr = m.get(parent) ?? [];
      arr.push(code);
      m.set(parent, arr);
    }
    return m;
  }, [activeSubcategories, subParent]);

  const activeTypes = useMemo(
    () => activeCategories.filter(isTypeCode),
    [activeCategories, isTypeCode],
  );
  const activeThemes = useMemo(
    () => activeCategories.filter((c) => !isTypeCode(c)),
    [activeCategories, isTypeCode],
  );

  /** The selected subfilters, split by which box their parent chip sits in. */
  const typeSubs = useMemo(
    () => new Map([...selectedSubsByParent].filter(([parent]) => isTypeCode(parent))),
    [selectedSubsByParent, isTypeCode],
  );
  const themeSubs = useMemo(
    () => new Map([...selectedSubsByParent].filter(([parent]) => !isTypeCode(parent))),
    [selectedSubsByParent, isTypeCode],
  );

  const activeFandoms = useMemo(() => {
    const raw = parseListParam(searchParams.get("fandom"));
    return knownFandoms.size > 0 ? raw.filter((f) => knownFandoms.has(f)) : raw;
  }, [searchParams, knownFandoms]);

  const waterproof = searchParams.get("waterproof") === "true";

  const urlMaxPrice = useMemo(
    () =>
      parseNumberParam(searchParams.get("maxPrice"), {
        min: MIN_PRICE,
        max: MAX_PRICE,
        fallback: DEFAULT_MAX_PRICE,
      }),
    [searchParams],
  );

  const sort = useMemo<Sort>(() => {
    const raw = searchParams.get("sort");
    return SORT_OPTIONS.some((o) => o.id === raw) ? (raw as Sort) : DEFAULT_SORT;
  }, [searchParams]);

  const urlSearch = useMemo(
    () => (searchParams.get("search") ?? searchParams.get("q") ?? "").trim(),
    [searchParams],
  );

  const urlPage = useMemo(() => parseIntParam(searchParams.get("page"), 1), [searchParams]);

  /** product id → its place in the units-sold ranking (0 = best seller). */
  const popularityRank = useMemo(
    () => new Map(popularity.map((id, i) => [id, i])),
    [popularity],
  );

  /* --------------------------- writing to the URL ------------------------- */

  /**
   * Patch the query string. Any filter change drops `page` (a new result set
   * always starts at page 1) unless the patch sets the page itself.
   * `replace` avoids a history entry for continuous inputs; `scroll` is only
   * wanted when paging.
   */
  const applyFilters = useCallback(
    (patch: Record<string, ParamValue>, opts?: { replace?: boolean; scroll?: boolean }) => {
      const query = withParams(searchParams, { page: null, ...patch });
      const url = query ? `${pathname}?${query}` : pathname;
      const options = { scroll: opts?.scroll ?? false };
      if (opts?.replace) router.replace(url, options);
      else router.push(url, options);
    },
    [pathname, router, searchParams],
  );

  // Continuous inputs: instant locally, written to the URL once the user pauses.
  const [searchInput, setSearchInput] = useDebouncedUrlValue(
    urlSearch,
    useCallback(
      (value: string) => applyFilters({ search: value.trim() || null }, { replace: true }),
      [applyFilters],
    ),
  );
  const [priceInput, setPriceInput] = useDebouncedUrlValue(
    urlMaxPrice,
    useCallback(
      (value: number) =>
        applyFilters(
          { maxPrice: value === DEFAULT_MAX_PRICE ? null : value },
          { replace: true },
        ),
      [applyFilters],
    ),
  );

  // Every handler the two memoised filter boxes receive is a useCallback: the
  // store re-renders on each keystroke in the search field, and an inline arrow
  // would hand the boxes a new prop each time and re-render every chip in the
  // shop for nothing.
  const toggleCategory = useCallback((code: string) => {
    const nextCategories = toggleInList(activeCategories, code);
    // Un-selecting a category takes its subcategories with it. When nothing is
    // left selected the subfilters are kept: they stand on their own, and
    // dropping them would silently widen the results the shopper just narrowed.
    const nextSubs =
      nextCategories.length === 0
        ? activeSubcategories
        : activeSubcategories.filter((s) => {
            const parent = subParent.get(s);
            return parent ? nextCategories.includes(parent) : false;
          });
    setSubMenuFor(null);
    // `cat` is cleared alongside: it is the legacy single-category key, and an
    // empty `category` drops out of the URL entirely — leaving a stale `cat`
    // behind to resurface as the filter the shopper had just switched off.
    applyFilters({ category: nextCategories, cat: null, subcategory: nextSubs });
  }, [activeCategories, activeSubcategories, subParent, applyFilters]);

  const toggleSubcategory = useCallback(
    (code: string) => applyFilters({ subcategory: toggleInList(activeSubcategories, code) }),
    [activeSubcategories, applyFilters],
  );

  /** Clear every subcategory belonging to one category chip. */
  const clearSubcategoriesOf = useCallback(
    (categoryCode: string) =>
      applyFilters({
        subcategory: activeSubcategories.filter((s) => subParent.get(s) !== categoryCode),
      }),
    [activeSubcategories, subParent, applyFilters],
  );

  /**
   * The "all" chip of ONE box: clears that box's chips and their subfilters and
   * leaves the other box exactly as it was, so clearing the product types of a
   * "gaming stickers" view widens it to all gaming rather than to everything.
   */
  const clearCategoryBox = useCallback(
    (box: "type" | "theme") => {
      const keep = (code: string) => (box === "type" ? !isTypeCode(code) : isTypeCode(code));
      setSubMenuFor(null);
      applyFilters({
        category: activeCategories.filter(keep),
        cat: null,
        subcategory: activeSubcategories.filter((s) => {
          const parent = subParent.get(s);
          return parent ? keep(parent) : true;
        }),
      });
    },
    [activeCategories, activeSubcategories, subParent, applyFilters, isTypeCode],
  );

  /** The side panel's filters (fandom / waterproof / price) back to defaults. */
  function clearFilters() {
    setPriceInput(DEFAULT_MAX_PRICE);
    applyFilters({ fandom: null, waterproof: null, maxPrice: null });
  }

  /** The empty-state reset — everything, including search and categories. */
  function clearEverything() {
    setSearchInput("");
    setPriceInput(DEFAULT_MAX_PRICE);
    applyFilters({
      category: null,
      cat: null,
      subcategory: null,
      fandom: null,
      waterproof: null,
      maxPrice: null,
      search: null,
      q: null,
    });
  }

  const hasActiveFilters =
    activeFandoms.length > 0 || waterproof || urlMaxPrice !== DEFAULT_MAX_PRICE;

  /* ------------------------------- searching ------------------------------ */

  // DB-side typo-tolerant match ids (Postgres pg_trgm). Augments the instant
  // client fuzzy match so nothing is ever slower or missing — the client result
  // shows immediately and the RPC fills in extra matches when it returns.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [dbMatchIds, setDbMatchIds] = useState<Set<string> | null>(null);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = urlSearch;
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
  }, [urlSearch, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ------------------------------- results -------------------------------- */

  /**
   * Both boxes at once: OR inside each, AND between them.
   *
   *   stickers                     → every sticker
   *   stickers + gaming            → gaming stickers only
   *   posters, brooches + gaming, football
   *                                → posters and brooches about games or football
   *   gaming (no type chosen)      → every sticker, poster, brooch and medal
   *                                  that is about games
   */
  const matchesTaxonomy = useCallback(
    (p: (typeof products)[number]) =>
      matchesFilterBox(p, activeTypes, typeSubs) && matchesFilterBox(p, activeThemes, themeSubs),
    [activeTypes, typeSubs, activeThemes, themeSubs],
  );

  const filtered = useMemo(() => {
    const q = urlSearch;
    const list = products.filter((p) => {
      // Category/subcategory first; fandom, waterproof, price and search then
      // narrow that selection further (AND).
      if (!matchesTaxonomy(p)) return false;
      if (activeFandoms.length > 0 && !activeFandoms.some((f) => p.fandoms.includes(f))) {
        return false;
      }
      if (waterproof && !p.waterproof) return false;
      if (lowestPrice(p) > urlMaxPrice) return false;
      if (q) {
        // Match if EITHER the instant client fuzzy matcher OR the Postgres
        // trigram RPC accepts it — the DB catches typos the client misses.
        const haystack = `${p.nameAr} ${p.nameEn} ${p.subAr} ${p.subEn} ${p.tags.join(" ")}`;
        if (!fuzzyMatch(q, haystack) && !dbMatchIds?.has(p.id)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      switch (sort) {
        case "priceAsc":
          return lowestPrice(a) - lowestPrice(b);
        case "priceDesc":
          return lowestPrice(b) - lowestPrice(a);
        case "newest":
          // When the row was CREATED, newest first — the same signal the home
          // page's "وصل حديثاً" rail uses. Deliberately not the admin's manual
          // sort_order (which is curation, not age) and not any edit: fixing a
          // typo in a year-old product must not make it new again.
          return b.createdAt.localeCompare(a.createdAt);
        default:
          // "Popular" = units actually ordered, most first. Anything that has
          // never sold has no place in that ranking, so it sorts below all of
          // it, by the admin's curated order as before.
          return (
            (popularityRank.get(a.id) ?? UNRANKED) - (popularityRank.get(b.id) ?? UNRANKED) ||
            b.order - a.order
          );
      }
    });
  }, [
    products,
    matchesTaxonomy,
    activeFandoms,
    waterproof,
    urlMaxPrice,
    urlSearch,
    sort,
    dbMatchIds,
    popularityRank,
  ]);

  // Subcategories grouped by their parent category → drives the per-chip menu.
  const subsByCat = useMemo(() => {
    const m = new Map<string, SubcategoryInfo[]>();
    for (const s of subcategories) {
      const arr = m.get(s.categoryCode) ?? [];
      arr.push(s);
      m.set(s.categoryCode, arr);
    }
    return m;
  }, [subcategories]);

  const typeChips = useMemo(
    () =>
      typeCats.map((c) => ({
        code: c.code,
        label: lang === "ar" ? c.nameAr : c.nameEn,
        icon: c.icon,
      })),
    [typeCats, lang],
  );
  const themeChips = useMemo(
    () =>
      themeCats.map((c) => ({
        code: c.code,
        label: lang === "ar" ? c.nameAr : c.nameEn,
        icon: c.icon,
      })),
    [themeCats, lang],
  );

  const subLabel = useCallback(
    (code: string) => {
      const s = subcategories.find((x) => x.code === code);
      return s ? (lang === "ar" ? s.nameAr : s.nameEn) : code;
    },
    [subcategories, lang],
  );

  // Stable callbacks so the two memoised boxes don't re-render on every
  // keystroke in the search field.
  const clearTypeBox = useCallback(() => clearCategoryBox("type"), [clearCategoryBox]);
  const clearThemeBox = useCallback(() => clearCategoryBox("theme"), [clearCategoryBox]);

  /* ------------------------------ pagination ------------------------------ */

  // Per-page count: default 20 on phones, 32 on large screens, and the shopper
  // can override it. Device-specific, so it stays out of the shareable URL.
  const [pageSize, setPageSize] = useState(20);
  const pickedPageSize = useRef(false);
  useEffect(() => {
    if (pickedPageSize.current) return;
    setPageSize(window.matchMedia("(min-width: 1024px)").matches ? 32 : 20);
  }, []);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // A `page` beyond the result set (stale link, smaller page size) clamps in.
  const current = Math.min(urlPage, totalPages);
  const pageItems = filtered.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Everything that narrows the catalogue, in one box — search, sort,
          the filter drawer's handle, and the category chips with the +
          that opens each one's subcategories.

          Wrapped rather than left as siblings so the tour's "filters" step
          can spotlight the lot: highlighting the toolbar alone framed three
          of the six controls and left the chips — the filter most people
          actually reach for — outside the lit area, reading as "not this
          part". Carries no styles of its own, so the layout is unchanged. */}
      <div id="tour-filters">
        {/* Toolbar — search, sort and the filter drawer's handle. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-ink-3">
              <Search size={17} />
            </span>
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label={t("aria.close")}
                className="tap absolute inset-y-0 end-3 grid place-items-center text-ink-3 hover:text-brand"
              >
                <X size={15} />
              </button>
            )}
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
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
              onChange={(e) =>
                applyFilters({ sort: e.target.value === DEFAULT_SORT ? null : e.target.value })
              }
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

        {/* The category filter, in two boxes.

            One flat run of chips could not say what it meant: "stickers" and
            "games" sat side by side as if they were the same kind of choice,
            and picking both widened the results instead of narrowing them.
            Split, each box answers one question — what is it, what is it about
            — and the two AND together, which is what a shopper looking for
            "game stickers" was trying to say all along.

            The boxes carry their own accents (warm brand / cool blue) so the
            separation registers before any label is read, and they stack on a
            phone and sit side by side from lg up. */}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <CategoryFilterGroup
            tone="brand"
            title={t("store.groupType")}
            hint={t("store.groupTypeHint")}
            icon={TYPE_BOX_ICON}
            allLabel={t("cat.all")}
            chips={typeChips}
            active={activeTypes}
            subsByCat={subsByCat}
            activeSubcategories={activeSubcategories}
            subLabel={subLabel}
            subMenuLabel={t("store.subcategory")}
            openMenuFor={subMenuFor}
            onOpenMenu={setSubMenuFor}
            onToggle={toggleCategory}
            onClearGroup={clearTypeBox}
            onToggleSub={toggleSubcategory}
            onClearSubsOf={clearSubcategoriesOf}
          />
          <CategoryFilterGroup
            tone="sky"
            title={t("store.groupTheme")}
            hint={t("store.groupThemeHint")}
            icon={THEME_BOX_ICON}
            allLabel={t("cat.all")}
            chips={themeChips}
            active={activeThemes}
            subsByCat={subsByCat}
            activeSubcategories={activeSubcategories}
            subLabel={subLabel}
            subMenuLabel={t("store.subcategory")}
            openMenuFor={subMenuFor}
            onOpenMenu={setSubMenuFor}
            onToggle={toggleCategory}
            onClearGroup={clearThemeBox}
            onToggleSub={toggleSubcategory}
            onClearSubsOf={clearSubcategoriesOf}
          />
        </div>

        {/* How the two boxes combine — the one thing the layout can't say on
            its own, and the only reason a shopper would think to use both. */}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{t("store.groupsHint")}</p>
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
              <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
                <Search size={26} />
              </span>
              <p className="mt-3 font-bold text-ink">{t("store.empty")}</p>
              <p className="mt-1 text-sm text-ink-3">{t("store.emptyHint")}</p>
              <button
                type="button"
                onClick={clearEverything}
                className="tap mt-4 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
              >
                {t("store.clear")}
              </button>
            </div>
          ) : (
            <>
              <div
                id="tour-catalog"
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
              >
                {current === 1 && (
                  <>
                    <CustomOrderCard />
                    {/* Renders nothing for a customer — see ManualOrderCard */}
                    <ManualOrderCard />
                  </>
                )}
                {pageItems.map((p, i) => (
                  <ProductCard key={p.id} productId={p.id} priority={current === 1 && i < 2} />
                ))}
              </div>

              {/* Pagination + per-page control — always at the bottom of the
                  cards. The prev/next arrows stay put (disabled at the edges)
                  so the control is consistent even on a single page. */}
              <div className="mt-10 flex flex-col items-center gap-4 border-t border-line-2 pt-6">
                <Pagination
                  current={current}
                  totalPages={totalPages}
                  onChange={(p) => applyFilters({ page: p > 1 ? p : null }, { scroll: true })}
                  prevLabel={t("store.prev")}
                  nextLabel={t("store.next")}
                />
                <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-3">
                  {t("store.perPage")}
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      pickedPageSize.current = true;
                      setPageSize(Number(e.target.value));
                      // A different page size means a different page 1.
                      if (urlPage > 1) applyFilters({}, { replace: true });
                    }}
                    className="tap cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-ink-2 outline-none transition hover:border-brand focus:border-brand"
                  >
                    {[20, 32, 48, 96].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
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
              fandoms={activeFandoms}
              waterproof={waterproof}
              maxPrice={priceInput}
              onFandom={(code) => applyFilters({ fandom: toggleInList(activeFandoms, code) })}
              onClearFandoms={() => applyFilters({ fandom: null })}
              onWaterproof={(v) => applyFilters({ waterproof: v })}
              onMaxPrice={setPriceInput}
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
    <nav className="flex items-center justify-center gap-1.5" aria-label="pagination">
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
