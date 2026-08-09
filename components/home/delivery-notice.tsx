"use client";

import { useStore } from "@/components/providers/store-provider";
import { Truck, MapPin } from "@/components/icons";
import { formatPrice } from "@/lib/format";

/**
 * The one thing shoppers ask before they order: what does delivery cost.
 *
 * Reads the live fee out of site settings rather than repeating a number in
 * the copy, so changing it in the dashboard changes it here too — a hardcoded
 * "3,000" would quietly start lying the first time the fee moved.
 *
 * Karbala gets its own line because it genuinely is cheaper, and a banner that
 * says "every province" while charging two different amounts is the kind of
 * small dishonesty shoppers notice at checkout. Only rendered when the two fees
 * actually differ, so the layout stays quiet if they're ever unified.
 */
export function DeliveryNotice() {
  const { t, lang, siteSettings } = useStore();
  const { deliveryFeeDefault, deliveryFeeKarbala } = siteSettings;
  const karbalaDiffers = deliveryFeeKarbala !== deliveryFeeDefault;

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

        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-surface px-3.5 py-2 text-sm font-black text-brand shadow-sm">
            {formatPrice(deliveryFeeDefault, lang)}
          </span>
          {karbalaDiffers && (
            <span className="inline-flex items-center gap-1 rounded-xl border border-line-2 bg-surface/70 px-2.5 py-2 text-[11px] font-bold text-ink-2">
              <MapPin size={12} className="shrink-0 text-brand" />
              {t("delivery.karbala")}
              <span className="font-black text-ink">{formatPrice(deliveryFeeKarbala, lang)}</span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
