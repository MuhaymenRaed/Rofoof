"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/components/providers/store-provider";
import { Sparkles, Check, Award, Sticker, Photo } from "@/components/icons";
import {
  CUSTOM_ORDER_COLOR,
  CUSTOM_TYPE_LABEL,
  type CustomPricing,
  type CustomType,
} from "@/lib/products";
import { updateCustomPricingAction } from "@/lib/actions/offers";

const TYPE_ICON: Record<CustomType, React.ComponentType<{ size?: number }>> = {
  brooch: Award,
  sticker: Sticker,
  poster: Photo,
};

/**
 * Admin control over custom-request pricing (per-type unit price +
 * waterproof extra). What's saved here is what the storefront modal shows
 * and what place_custom_request() charges.
 */
export function CustomPricingEditor({ initialPricing }: { initialPricing: CustomPricing[] }) {
  const { t, lang } = useStore();
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    initialPricing.map((p) => ({
      kind: p.kind,
      unitPrice: String(p.unitPrice),
      waterproofExtra: String(p.waterproofExtra),
    })),
  );
  const [savedKind, setSavedKind] = useState<CustomType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function setField(kind: CustomType, field: "unitPrice" | "waterproofExtra", value: string) {
    setRows((prev) => prev.map((r) => (r.kind === kind ? { ...r, [field]: value } : r)));
  }

  function save(kind: CustomType) {
    const row = rows.find((r) => r.kind === kind);
    if (!row) return;
    setError(null);
    startTransition(async () => {
      const res = await updateCustomPricingAction({
        kind,
        unitPrice: Math.max(0, Number(row.unitPrice) || 0),
        waterproofExtra: Math.max(0, Number(row.waterproofExtra) || 0),
      });
      if (!res.ok) {
        setError(res.error ?? "error");
        return;
      }
      setSavedKind(kind);
      setTimeout(() => setSavedKind(null), 1500);
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <section
      className="mb-6 rounded-2xl border bg-surface card-shadow"
      style={{ borderColor: `color-mix(in srgb, ${CUSTOM_ORDER_COLOR} 40%, transparent)` }}
    >
      <h2 className="flex items-center gap-2 border-b border-line-2 p-5 text-sm font-extrabold text-ink">
        <span
          className="grid h-8 w-8 place-items-center rounded-lg text-white"
          style={{ background: CUSTOM_ORDER_COLOR }}
        >
          <Sparkles size={16} />
        </span>
        {t("custom.pricingTitle")}
      </h2>

      <div className="divide-y divide-line-2">
        {rows.map((row) => {
          const meta = CUSTOM_TYPE_LABEL[row.kind];
          const Icon = TYPE_ICON[row.kind];
          const waterproofable = row.kind !== "brooch";
          return (
            <div key={row.kind} className="flex flex-wrap items-end gap-3 p-4 sm:px-5">
              <span className="flex min-w-24 items-center gap-2 pb-2.5 text-sm font-bold text-ink">
                <Icon size={17} />
                {lang === "ar" ? meta.ar : meta.en}
              </span>

              <label className="block flex-1 basis-32">
                <span className="mb-1.5 block text-[11px] font-bold text-ink-3">
                  {t("custom.perPiece")}
                </span>
                <input
                  type="number"
                  min={0}
                  value={row.unitPrice}
                  onChange={(e) => setField(row.kind, "unitPrice", e.target.value)}
                  className="dash-input h-10"
                />
              </label>

              {waterproofable && (
                <label className="block flex-1 basis-32">
                  <span className="mb-1.5 block text-[11px] font-bold text-ink-3">
                    {t("dash.surcharge")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={row.waterproofExtra}
                    onChange={(e) => setField(row.kind, "waterproofExtra", e.target.value)}
                    className="dash-input h-10"
                  />
                </label>
              )}

              <button
                type="button"
                onClick={() => save(row.kind)}
                disabled={pending}
                className="tap inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: savedKind === row.kind ? "#22c55e" : CUSTOM_ORDER_COLOR }}
              >
                {savedKind === row.kind ? <Check size={14} /> : null}
                {savedKind === row.kind ? t("dash.saved") : t("dash.saveChanges")}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="border-t border-line-2 px-5 py-3 text-xs font-semibold text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}
