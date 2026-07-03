"use client";

import { useStore } from "@/components/providers/store-provider";
import { X, Droplet } from "@/components/icons";
import { MAX_PRICE } from "@/lib/products";
import { formatPrice } from "@/lib/format";

type FandomSel = string;

export interface FilterState {
  fandom: FandomSel;
  waterproof: boolean;
  maxPrice: number;
}

interface Props extends FilterState {
  onFandom: (f: FandomSel) => void;
  onWaterproof: (v: boolean) => void;
  onMaxPrice: (v: number) => void;
  onClear: () => void;
  onClose: () => void;
  hasActive: boolean;
}

export function FilterPanel({
  fandom,
  waterproof,
  maxPrice,
  onFandom,
  onWaterproof,
  onMaxPrice,
  onClear,
  onClose,
  hasActive,
}: Props) {
  const { t, lang, fandoms } = useStore();

  // DB-driven fandoms + the "all" reset option (admins can add more)
  const options = [
    { code: "all", label: t("fandom.all") },
    ...fandoms.map((f) => ({ code: f.code, label: lang === "ar" ? f.nameAr : f.nameEn })),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* header (close visible on mobile only) */}
      <div className="mb-5 flex items-center justify-between lg:mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-ink">{t("store.filter")}</h3>
          {hasActive && (
            <button
              type="button"
              onClick={onClear}
              className="tap text-[11px] font-bold text-brand transition hover:opacity-75"
            >
              {t("store.clear")}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("aria.close")}
          className="tap grid h-8 w-8 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 lg:hidden"
        >
          <X size={18} />
        </button>
      </div>

      {/* Fandom */}
      <div className="rounded-2xl border border-line-2 bg-surface p-4">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-ink-3">
          {t("fandom.label")}
        </p>
        <div className="space-y-1">
          {options.map((f) => {
            const active = fandom === f.code;
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => onFandom(f.code)}
                className={`tap flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                  active
                    ? "bg-brand-soft text-brand"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {f.label}
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full border transition ${
                    active ? "border-brand" : "border-line"
                  }`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-brand" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Waterproof toggle */}
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-line-2 bg-surface p-4">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Droplet size={16} className="text-brand" />
          {t("store.waterproofOnly")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={waterproof}
          onClick={() => onWaterproof(!waterproof)}
          className={`tap relative h-6 w-11 rounded-full transition ${
            waterproof ? "bg-brand" : "bg-surface-3"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              waterproof ? "start-[22px]" : "start-0.5"
            }`}
          />
        </button>
      </div>

      {/* Max price */}
      <div className="mt-3 rounded-2xl border border-line-2 bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
            {t("store.maxPrice")}
          </p>
          <span className="text-sm font-extrabold text-brand">{formatPrice(maxPrice, lang)}</span>
        </div>
        <input
          type="range"
          min={1000}
          max={MAX_PRICE}
          step={500}
          value={maxPrice}
          onChange={(e) => onMaxPrice(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-brand"
          aria-label={t("store.maxPrice")}
        />
        <div className="mt-2 flex justify-between text-[10px] font-medium text-ink-3">
          <span>{formatPrice(1000, lang)}</span>
          <span>{formatPrice(MAX_PRICE, lang)}</span>
        </div>
      </div>
    </div>
  );
}
