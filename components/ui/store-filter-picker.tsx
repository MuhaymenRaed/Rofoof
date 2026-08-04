"use client";

import { useMemo } from "react";
import { useStore } from "@/components/providers/store-provider";
import { Check } from "@/components/icons";
import type { FeaturedLinkScope } from "@/lib/products";

/**
 * Picks a store filter for a rail's "show all" button — a scope (category /
 * subfilter / fandom) plus ANY NUMBER of its values, matching the store page,
 * which combines several values of one group with OR.
 *
 * Shared by the home-page rail editor and the dashboard so the target is chosen
 * the same way in both places. Values come from the live taxonomy, so the admin
 * can only ever point at a filter that actually exists.
 */
export function StoreFilterPicker({
  scope,
  values,
  onChange,
  compact = false,
}: {
  scope: FeaturedLinkScope | null;
  values: string[];
  onChange: (next: { scope: FeaturedLinkScope | null; values: string[] }) => void;
  /** tighter controls, for the inline editor on the home page */
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

  function toggle(code: string) {
    if (!scope) return;
    onChange({
      scope,
      values: values.includes(code) ? values.filter((v) => v !== code) : [...values, code],
    });
  }

  return (
    <div className="space-y-2">
      <select
        value={scope ?? ""}
        onChange={(e) => {
          const next = (e.target.value || null) as FeaturedLinkScope | null;
          // A different scope means the old codes no longer apply.
          onChange({ scope: next, values: [] });
        }}
        aria-label={t("dash.featuredBy")}
        className={`dash-input ${compact ? "h-9" : ""} w-full cursor-pointer sm:w-56`}
      >
        <option value="">{t("dash.linkNone")}</option>
        <option value="category">{t("dash.byCategory")}</option>
        <option value="subcategory">{t("dash.bySubcategory")}</option>
        <option value="fandom">{t("dash.byFandom")}</option>
      </select>

      {scope && (
        <>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {options.map((o) => {
              const on = values.includes(o.code);
              return (
                <button
                  key={o.code}
                  type="button"
                  onClick={() => toggle(o.code)}
                  aria-pressed={on}
                  className={`tap inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                    on
                      ? "border-brand bg-brand text-white"
                      : "border-line bg-surface text-ink-2 hover:border-brand hover:text-brand"
                  }`}
                >
                  {o.label}
                  {on && <Check size={11} className="shrink-0" />}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-3">
            {values.length > 0 ? t("dash.linkPickedHint") : t("dash.linkPickHint")}
          </p>
        </>
      )}
    </div>
  );
}
