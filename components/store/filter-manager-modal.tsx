"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { X, Plus, Trash } from "@/components/icons";
import {
  createCategoryAction,
  deleteCategoryAction,
  createFandomAction,
  deleteFandomAction,
  createSubcategoryAction,
  deleteSubcategoryAction,
} from "@/lib/actions/products";

type Layer = "categories" | "subcategories" | "fandoms";

/**
 * Admin-only manager for all three filter layers (category → subcategory, and
 * fandom). Opened straight from the store page so the taxonomy can be tuned
 * where it's actually used, without a detour through the dashboard.
 */
export function FilterManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang, categories, subcategories, fandoms } = useStore();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [layer, setLayer] = useState<Layer>("categories");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const label = (x: { nameAr: string; nameEn: string }) => (lang === "ar" ? x.nameAr : x.nameEn);

  function add() {
    if (!nameAr.trim() || !nameEn.trim()) return;
    if (layer === "subcategories" && !parent) return;
    setError(null);
    startTransition(async () => {
      const payload = { nameAr: nameAr.trim(), nameEn: nameEn.trim() };
      const res =
        layer === "categories"
          ? await createCategoryAction(payload)
          : layer === "fandoms"
            ? await createFandomAction(payload)
            : await createSubcategoryAction({ ...payload, categoryCode: parent });
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      setNameAr("");
      setNameEn("");
      router.refresh();
    });
  }

  function remove(code: string) {
    setError(null);
    startTransition(async () => {
      const res =
        layer === "categories"
          ? await deleteCategoryAction(code)
          : layer === "fandoms"
            ? await deleteFandomAction(code)
            : await deleteSubcategoryAction(code);
      if (!res.ok) {
        setError(res.error ?? t("checkout.error"));
        return;
      }
      router.refresh();
    });
  }

  const rows =
    layer === "categories" ? categories : layer === "fandoms" ? fandoms : subcategories;

  const LAYERS: { id: Layer; key: Parameters<typeof t>[0] }[] = [
    { id: "categories", key: "dash.fieldCategories" },
    { id: "subcategories", key: "store.subcategory" },
    { id: "fandoms", key: "fandom.label" },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[75] grid place-items-center p-4">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        style={{ animation: "fade-in 0.2s ease both" }}
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg animate-pop flex-col overflow-hidden rounded-3xl border border-line-2 bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 px-6 py-4">
          <h2 className="text-lg font-black text-ink">{t("store.manageFilters")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("aria.close")}
            className="tap grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Layer switch */}
          <div className="flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
            {LAYERS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLayer(l.id)}
                aria-pressed={layer === l.id}
                className={`tap flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                  layer === l.id ? "bg-brand text-white shadow-sm" : "text-ink-2 hover:text-brand"
                }`}
              >
                {t(l.key)}
              </button>
            ))}
          </div>

          {/* Existing entries */}
          <div className="flex flex-wrap gap-2">
            {rows.length === 0 && <p className="text-xs text-ink-3">{t("dash.empty")}</p>}
            {rows.map((r) => (
              <span
                key={r.code}
                className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface py-1.5 pe-1 ps-3 text-xs font-bold text-ink-2"
              >
                {label(r)}
                <button
                  type="button"
                  onClick={() => remove(r.code)}
                  disabled={pending}
                  aria-label={t("offer.delete")}
                  className="tap grid h-5 w-5 place-items-center rounded-md opacity-60 transition hover:bg-red-500/10 hover:text-red-500 hover:opacity-100 disabled:opacity-30"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>

          {/* Add new */}
          <div className="space-y-2 rounded-xl border border-line-2 bg-surface-2/50 p-3">
            {layer === "subcategories" && (
              <select
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                aria-label={t("dash.fieldCategories")}
                className="dash-input h-9 cursor-pointer"
              >
                <option value="">{t("dash.fieldCategories")}</option>
                {categories.map((c) => (
                  <option key={c.code} value={c.code}>
                    {label(c)}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={t("dash.catNameAr")}
                className="dash-input h-9 flex-1"
              />
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder={t("dash.catNameEn")}
                dir="ltr"
                className="dash-input h-9 flex-1 text-start"
              />
              <button
                type="button"
                onClick={add}
                disabled={
                  pending ||
                  !nameAr.trim() ||
                  !nameEn.trim() ||
                  (layer === "subcategories" && !parent)
                }
                className="tap inline-flex shrink-0 items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <Plus size={14} />
                {t("dash.addCategory")}
              </button>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">
              {error}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
            <Trash size={12} className="mt-0.5 shrink-0" />
            {t("store.manageFiltersHint")}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
