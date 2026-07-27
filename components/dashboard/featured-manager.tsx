"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useStore } from "@/components/providers/store-provider";
import { Star, Check, Package, Plus } from "@/components/icons";
import {
  setProductFeaturedAction,
  setProductsFeaturedAction,
} from "@/lib/actions/products";
import { updateFeaturedTitleAction } from "@/lib/actions/settings";
import { formatPrice } from "@/lib/format";
import { lowestPrice, type Product } from "@/lib/products";

type Scope = "category" | "subcategory" | "fandom";

/**
 * Dashboard "featured picks" manager — full control over the homepage showcase:
 * rename the section, feature a whole category / subfilter / fandom in one tap,
 * and see every starred product grouped by its main category with a one-tap
 * remove. Everything updates live here — no page refresh.
 */
export function FeaturedManager({
  initialProducts,
  titleAr,
  titleEn,
}: {
  initialProducts: Product[];
  titleAr: string;
  titleEn: string;
}) {
  const {
    t,
    lang,
    categoryLabel,
    products: catalog,
    categories,
    subcategories,
    fandoms,
  } = useStore();

  const [products, setProducts] = useState(initialProducts);
  const [ar, setAr] = useState(titleAr);
  const [en, setEn] = useState(titleEn);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Bulk-add control
  const [scope, setScope] = useState<Scope>("category");
  const [scopeValue, setScopeValue] = useState("");
  const [addedCount, setAddedCount] = useState<number | null>(null);

  const featuredIds = useMemo(() => new Set(products.map((p) => p.id)), [products]);

  // Options for the second dropdown, driven by the chosen scope.
  const scopeOptions = useMemo(() => {
    if (scope === "category")
      return categories.map((c) => ({ code: c.code, label: lang === "ar" ? c.nameAr : c.nameEn }));
    if (scope === "subcategory")
      return subcategories.map((s) => ({
        code: s.code,
        label: `${lang === "ar" ? s.nameAr : s.nameEn} · ${categoryLabel(s.categoryCode)}`,
      }));
    return fandoms.map((f) => ({ code: f.code, label: lang === "ar" ? f.nameAr : f.nameEn }));
  }, [scope, categories, subcategories, fandoms, lang, categoryLabel]);

  // Active products matching the chosen scope+value that aren't featured yet.
  const matches = useMemo(() => {
    if (!scopeValue) return [];
    return catalog.filter((p) => {
      if (featuredIds.has(p.id)) return false;
      if (scope === "category") return p.categories.includes(scopeValue) || p.category === scopeValue;
      if (scope === "subcategory") return p.subcategories.includes(scopeValue);
      return p.fandoms.includes(scopeValue);
    });
  }, [catalog, scope, scopeValue, featuredIds]);

  // Group by primary category so the admin can eyeball the showcase's balance.
  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.category || "—";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [products]);

  function saveTitle() {
    if (!ar.trim() || !en.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await updateFeaturedTitleAction({ ar: ar.trim(), en: en.trim() });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  function bulkAdd() {
    if (matches.length === 0) return;
    const added = matches;
    const ids = added.map((p) => p.id);
    setProducts((prev) => [...added, ...prev]); // live, no refresh
    setAddedCount(added.length);
    setScopeValue("");
    setTimeout(() => setAddedCount(null), 2500);
    startTransition(async () => {
      const res = await setProductsFeaturedAction(ids, true);
      if (!res.ok) {
        // roll back the ones we just added
        setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));
        setError(res.error ?? t("checkout.error"));
      }
    });
  }

  function unfeature(id: string) {
    const removed = products.find((p) => p.id === id);
    setProducts((prev) => prev.filter((p) => p.id !== id)); // live, no refresh
    startTransition(async () => {
      const res = await setProductFeaturedAction(id, false);
      if (!res.ok && removed) {
        setProducts((prev) => (prev.some((p) => p.id === id) ? prev : [removed, ...prev]));
        setError(res.error ?? t("checkout.error"));
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Rename the showcase */}
      <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <Star size={16} filled className="text-amber-500" />
          {t("dash.featuredTitle")}
        </h2>
        <p className="mt-1 text-[11px] text-ink-3">{t("dash.featuredTitleHint")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.featuredTitleAr")}
            </span>
            <input value={ar} onChange={(e) => setAr(e.target.value)} maxLength={60} className="dash-input" />
          </label>
          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">
              {t("dash.featuredTitleEn")}
            </span>
            <input
              value={en}
              onChange={(e) => setEn(e.target.value)}
              maxLength={60}
              dir="ltr"
              className="dash-input text-start"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={saveTitle}
          disabled={pending || !ar.trim() || !en.trim()}
          className="tap mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {saved ? <Check size={14} /> : null}
          {saved ? t("profile.saved") : t("profile.save")}
        </button>
      </section>

      {/* Bulk add by filter */}
      <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <Plus size={16} className="text-brand" />
          {t("dash.featuredBulk")}
        </h2>
        <p className="mt-1 text-[11px] text-ink-3">{t("dash.featuredBulkHint")}</p>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block sm:w-44">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("dash.featuredBy")}</span>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as Scope);
                setScopeValue("");
              }}
              className="dash-input cursor-pointer"
            >
              <option value="category">{t("dash.byCategory")}</option>
              <option value="subcategory">{t("dash.bySubcategory")}</option>
              <option value="fandom">{t("dash.byFandom")}</option>
            </select>
          </label>

          <label className="block flex-1">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">{t("dash.featuredPick")}</span>
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className="dash-input cursor-pointer"
            >
              <option value="">{t("dash.featuredPickValue")}</option>
              {scopeOptions.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={bulkAdd}
            disabled={pending || matches.length === 0}
            className="tap inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Star size={14} filled />
            {t("dash.featuredAddAll")}
            {scopeValue && matches.length > 0 ? ` (${matches.length})` : ""}
          </button>
        </div>

        {scopeValue && matches.length === 0 && (
          <p className="mt-2 text-[11px] font-semibold text-ink-3">{t("dash.featuredAllIn")}</p>
        )}
        {addedCount !== null && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
            <Check size={13} />
            {addedCount} {t("dash.featuredAdded")}
          </p>
        )}
      </section>

      {/* The starred products */}
      <section className="rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-ink">{t("dash.featuredList")}</h2>
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-bold text-brand">
            {products.length}
          </span>
        </div>

        {error && (
          <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
          </p>
        )}

        {products.length === 0 ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-line py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
              <Star size={22} />
            </div>
            <p className="mt-3 text-sm font-bold text-ink">{t("dash.featuredEmpty")}</p>
            <p className="mt-1 max-w-xs text-[12px] text-ink-3">{t("dash.featuredEmptyHint")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(([code, list]) => (
              <div key={code}>
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-ink-3">
                  {categoryLabel(code)}
                  <span className="ms-1.5 font-bold text-ink-3/70">({list.length})</span>
                </p>
                <ul className="space-y-2">
                  {list.map((p) => {
                    const name = lang === "ar" ? p.nameAr : p.nameEn;
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-3 rounded-xl border border-line-2 bg-surface-2/40 p-2.5"
                      >
                        <span
                          className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg text-lg"
                          style={{
                            background: `color-mix(in srgb, ${p.color} 14%, var(--surface))`,
                          }}
                        >
                          {p.image ? (
                            <Image src={p.image} alt="" fill sizes="44px" className="object-cover" />
                          ) : (
                            p.emoji || <Package size={16} className="text-ink-3" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-ink">{name}</span>
                          <span className="text-[11px] font-semibold text-ink-3">
                            {formatPrice(lowestPrice(p), lang)}
                            {!p.isActive && ` · ${t("dash.inactive")}`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => unfeature(p.id)}
                          aria-label={t("product.unfeature")}
                          className="tap inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[11px] font-bold text-ink-2 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-500"
                        >
                          <Star size={14} filled className="text-amber-500" />
                          {t("dash.featuredRemove")}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
