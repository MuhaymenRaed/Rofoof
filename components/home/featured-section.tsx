"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { ProductCard } from "@/components/ui/product-card";
import { Star, Check, X, ChevronEnd } from "@/components/icons";
import { Pencil } from "@/components/dashboard/dash-icons";
import { StoreFilterPicker } from "@/components/ui/store-filter-picker";
import {
  renameFeaturedGroupAction,
  setFeaturedGroupLinkAction,
} from "@/lib/actions/featured";
import { featuredGroupHref, type FeaturedGroup, type FeaturedLinkScope, type Product } from "@/lib/products";

/**
 * One admin-curated showcase rail on the home page. Any number of these stack
 * between "most ordered" and "just landed", in the admin's chosen order.
 * Products join a rail via the star picker on a card (or the product editor),
 * and the rail's title is renameable inline here as well as in the dashboard.
 */
export function FeaturedSection({
  group,
  products,
}: {
  group: FeaturedGroup;
  products: Product[];
}) {
  const { lang, t } = useStore();
  const { isAdmin, ready } = useAuth();
  const router = useRouter();

  const [ar, setAr] = useState(group.nameAr);
  const [en, setEn] = useState(group.nameEn);
  const [linkScope, setLinkScope] = useState<FeaturedLinkScope | null>(group.linkScope);
  const [linkValue, setLinkValue] = useState<string | null>(group.linkValue);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const canEdit = ready && isAdmin;
  const title = lang === "ar" ? ar : en;
  // Built from the saved scope+code; absent target → no button at all.
  const viewAllHref = featuredGroupHref({ linkScope, linkValue });

  function save() {
    if (!ar.trim() || !en.trim()) return;
    setError(false);
    startTransition(async () => {
      const res = await renameFeaturedGroupAction(group.id, {
        nameAr: ar.trim(),
        nameEn: en.trim(),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const linkRes = await setFeaturedGroupLinkAction(group.id, {
        scope: linkScope,
        value: linkValue,
      });
      if (!linkRes.ok) {
        setError(true);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setAr(group.nameAr);
    setEn(group.nameEn);
    setLinkScope(group.linkScope);
    setLinkValue(group.linkValue);
    setEditing(false);
    setError(false);
  }

  return (
    <section className="mt-9">
      <div className="mb-4 flex items-center justify-between gap-3">
        {editing ? (
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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

            {/* Where "show all" takes the shopper */}
            <div className="rounded-xl border border-line-2 bg-surface-2/40 p-2.5">
              <p className="mb-1.5 text-[11px] font-bold text-ink-2">{t("dash.linkLabel")}</p>
              <StoreFilterPicker
                compact
                scope={linkScope}
                value={linkValue}
                onChange={({ scope, value }) => {
                  setLinkScope(scope);
                  setLinkValue(value);
                }}
              />
            </div>
          </div>
        ) : (
          <>
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

            {/* Same treatment as the other home-page rails' "view all" */}
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="tap inline-flex shrink-0 items-center gap-1 text-xs font-bold text-brand transition hover:opacity-75"
              >
                {t("section.viewAll")}
                <ChevronEnd size={15} />
              </Link>
            )}
          </>
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
