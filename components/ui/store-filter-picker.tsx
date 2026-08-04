"use client";

import { useMemo } from "react";
import { useStore } from "@/components/providers/store-provider";
import type { FeaturedLinkScope } from "@/lib/products";

/**
 * Picks a store filter — a scope (category / subfilter / fandom) plus one of
 * its values. Shared by the home-page rail editor and the dashboard so a rail's
 * "show all" target is chosen the same way in both places.
 *
 * Values come from the live taxonomy, so the admin can only ever point at a
 * filter that actually exists.
 */
export function StoreFilterPicker({
  scope,
  value,
  onChange,
  compact = false,
}: {
  scope: FeaturedLinkScope | null;
  value: string | null;
  onChange: (next: { scope: FeaturedLinkScope | null; value: string | null }) => void;
  /** shorter controls, for the inline editor on the home page */
  compact?: boolean;
}) {
  const { t, lang, categories, subcategories, fandoms, categoryLabel } = useStore();

  const options = useMemo(() => {
    if (scope === "category")
      return categories.map((c) => ({ code: c.code, label: lang === "ar" ? c.nameAr : c.nameEn }));
    if (scope === "subcategory")
      return subcategories.map((s) => ({
        code: s.code,
        label: `${lang === "ar" ? s.nameAr : s.nameEn} · ${categoryLabel(s.categoryCode)}`,
      }));
    if (scope === "fandom")
      return fandoms.map((f) => ({ code: f.code, label: lang === "ar" ? f.nameAr : f.nameEn }));
    return [];
  }, [scope, categories, subcategories, fandoms, lang, categoryLabel]);

  const height = compact ? "h-9" : "";

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        value={scope ?? ""}
        onChange={(e) => {
          const next = (e.target.value || null) as FeaturedLinkScope | null;
          // Changing the scope invalidates the old value.
          onChange({ scope: next, value: null });
        }}
        aria-label={t("dash.featuredBy")}
        className={`dash-input ${height} cursor-pointer sm:w-44`}
      >
        <option value="">{t("dash.linkNone")}</option>
        <option value="category">{t("dash.byCategory")}</option>
        <option value="subcategory">{t("dash.bySubcategory")}</option>
        <option value="fandom">{t("dash.byFandom")}</option>
      </select>

      {scope && (
        <select
          value={value ?? ""}
          onChange={(e) => onChange({ scope, value: e.target.value || null })}
          aria-label={t("dash.featuredPick")}
          className={`dash-input ${height} flex-1 cursor-pointer`}
        >
          <option value="">{t("dash.featuredPickValue")}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
