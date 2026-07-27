"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProductCard } from "@/components/ui/product-card";
import { Star, Check, X } from "@/components/icons";
import { Pencil } from "@/components/dashboard/dash-icons";
import { updateFeaturedTitleAction } from "@/lib/actions/settings";
import type { Product } from "@/lib/products";

/**
 * Homepage "featured picks" showcase — an admin-curated rail sitting between
 * "most ordered" and "just landed". Products land here by their star toggle
 * (on the card or in the editor). The section title is admin-editable both in
 * the dashboard and inline right here.
 */
export function FeaturedSection({
  products,
  titleAr,
  titleEn,
}: {
  products: Product[];
  titleAr: string;
  titleEn: string;
}) {
  const { lang, t } = useStore();
  const { isAdmin, ready } = useAuth();
  const router = useRouter();

  const [ar, setAr] = useState(titleAr);
  const [en, setEn] = useState(titleEn);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const canEdit = ready && isAdmin;
  const title = lang === "ar" ? ar : en;

  function save() {
    if (!ar.trim() || !en.trim()) return;
    setError(false);
    startTransition(async () => {
      const res = await updateFeaturedTitleAction({ ar: ar.trim(), en: en.trim() });
      if (!res.ok) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setAr(titleAr);
    setEn(titleEn);
    setEditing(false);
    setError(false);
  }

  return (
    <section className="mt-9">
      <div className="mb-4 flex items-center justify-between gap-3">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              value={ar}
              onChange={(e) => setAr(e.target.value)}
              placeholder={t("dash.featuredTitleAr")}
              aria-label={t("dash.featuredTitleAr")}
              maxLength={60}
              className="dash-input h-9 w-40 flex-1"
            />
            <input
              value={en}
              onChange={(e) => setEn(e.target.value)}
              placeholder={t("dash.featuredTitleEn")}
              aria-label={t("dash.featuredTitleEn")}
              dir="ltr"
              maxLength={60}
              className="dash-input h-9 w-40 flex-1 text-start"
            />
            <button
              type="button"
              onClick={save}
              disabled={pending || !ar.trim() || !en.trim()}
              aria-label={t("profile.save")}
              className="tap grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Check size={16} />
            </button>
            <button
              type="button"
              onClick={cancel}
              aria-label={t("dash.cancel")}
              className="tap grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-ink-2 transition hover:bg-surface-2"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <h2 className="flex items-center gap-2.5 text-base font-extrabold text-ink">
            <span className="h-4 w-1 shrink-0 rounded-full bg-brand" />
            <Star size={16} filled className="text-amber-500" />
            {title}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                aria-label={t("dash.featuredRename")}
                className="tap grid h-7 w-7 place-items-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-brand"
              >
                <Pencil size={13} />
              </button>
            )}
          </h2>
        )}
      </div>

      {error && (
        <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
          {t("checkout.error")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}
