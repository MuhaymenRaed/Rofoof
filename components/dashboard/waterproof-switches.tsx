"use client";

import { useState, useTransition } from "react";
import { useStore } from "@/components/providers/store-provider";
import { Droplet } from "@/components/icons";
import { updateWaterproofSettingsAction } from "@/lib/actions/offers";

/**
 * The two master switches for the waterproof add-on, one per side of the shop.
 *
 * Sits at the top of the inventory page because that is where an admin goes
 * when the shop has run out of something — withdrawing the laminate is the
 * same kind of decision as zeroing a stock count, and it belongs next to it
 * rather than buried in the offers tab with the delivery fees.
 *
 * Each switch saves on flick (no separate save button): there are exactly two
 * booleans here and nothing to review before committing, so a form would just
 * be a second click between the admin and the thing they came to do.
 */
export function WaterproofSwitches({
  initialProducts,
  initialCustom,
}: {
  initialProducts: boolean;
  initialCustom: boolean;
}) {
  const { t } = useStore();
  const [products, setProducts] = useState(initialProducts);
  const [custom, setCustom] = useState(initialCustom);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(next: { products: boolean; custom: boolean }) {
    // Optimistic, with the previous pair captured so a failure can put the
    // switch back where it was rather than leaving it showing a state the shop
    // is not actually in.
    const previous = { products, custom };
    setProducts(next.products);
    setCustom(next.custom);
    setError(null);
    startTransition(async () => {
      const res = await updateWaterproofSettingsAction(next);
      if (res.ok) return;
      setProducts(previous.products);
      setCustom(previous.custom);
      setError(res.error === "migration_missing" ? t("dash.waterproofMigration") : (res.error ?? null));
    });
  }

  return (
    <section className="mb-6 rounded-2xl border border-line-2 bg-surface p-5 card-shadow">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Droplet size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-ink">{t("dash.waterproofSwitches")}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
            {t("dash.waterproofSwitchesHint")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <SwitchRow
          label={t("dash.waterproofProducts")}
          checked={products}
          onChange={(v) => save({ products: v, custom })}
        />
        <SwitchRow
          label={t("dash.waterproofCustom")}
          checked={custom}
          onChange={(v) => save({ products, custom: v })}
        />
      </div>

      {error && <p className="mt-3 text-[11px] font-bold text-red-500">{error}</p>}
    </section>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`tap flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-start transition ${
        checked ? "border-brand bg-brand-soft/40" : "border-line bg-surface-2/50"
      }`}
    >
      <span className={`text-[13px] font-bold ${checked ? "text-brand" : "text-ink-2"}`}>
        {label}
      </span>
      <span
        aria-hidden
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand" : "bg-surface-3"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "start-[22px]" : "start-0.5"
          }`}
        />
      </span>
    </button>
  );
}
