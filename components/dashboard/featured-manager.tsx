"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Star, Check, Package } from "@/components/icons";
import { setProductFeaturedAction } from "@/lib/actions/products";
import { updateFeaturedTitleAction } from "@/lib/actions/settings";
import { formatPrice } from "@/lib/format";
import { lowestPrice, type Product } from "@/lib/products";

/**
 * Dashboard "featured picks" manager — full control over the homepage showcase:
 * rename the section, and see every starred product grouped by its main
 * category with a one-tap remove (un-star). Products are added to the showcase
 * by the star toggle on any product card or the checkbox in the product editor.
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
  const { t, lang, categoryLabel } = useStore();
  const router = useRouter();

  const [products, setProducts] = useState(initialProducts);
  const [ar, setAr] = useState(titleAr);
  const [en, setEn] = useState(titleEn);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      router.refresh();
    });
  }

  function unfeature(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id)); // optimistic
    startTransition(async () => {
      const res = await setProductFeaturedAction(id, false);
      if (!res.ok) router.refresh(); // failed — resync to restore it
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
        {error && (
          <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
            {error}
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
