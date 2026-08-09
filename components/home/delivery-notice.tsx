"use client";

import { useStore } from "@/components/providers/store-provider";
import { Truck } from "@/components/icons";
import { formatPrice } from "@/lib/format";

/**
 * The one thing shoppers ask before they order: what does delivery cost.
 *
 * One flat number for the whole country, on the way to every province costing
 * the same. It reads the live fee out of site settings rather than repeating a
 * number in the copy, so changing it in the dashboard changes it here — a
 * hardcoded 3,000 would quietly start lying the first time the fee moved.
 *
 * `deliveryFeeDefault` specifically, because that IS the every-province fee;
 * the Karbala rate is an exception to it. Quoting the exception as if it were
 * the rule would advertise a price most of the country doesn't get, and they'd
 * find out at checkout. The admin hides the whole banner from the dashboard
 * rather than this component second-guessing the numbers.
 */
export function DeliveryNotice() {
  const { t, lang, siteSettings } = useStore();
  const { deliveryFeeDefault } = siteSettings;

  return (
    <section
      aria-label={t("delivery.title")}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-line-2 bg-brand-soft px-5 py-4 sm:px-6"
    >
      {/* Soft brand wash pinned to the inline-end corner. aria-hidden and
          pointer-events-none: it's texture, not content. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-12 -end-12 h-40 w-40 rounded-full bg-brand/10 blur-2xl"
      />

      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-sm">
          <Truck size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black leading-tight text-ink sm:text-sm">
            {t("delivery.title")}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink-3">{t("delivery.flat")}</p>
        </div>

        <span className="rounded-xl bg-surface px-4 py-2 text-sm font-black text-brand shadow-sm">
          {formatPrice(deliveryFeeDefault, lang)}
        </span>
      </div>
    </section>
  );
}
