"use client";

import { useStore } from "@/components/providers/store-provider";
import { Truck } from "@/components/icons";
import { formatPrice } from "@/lib/format";

/**
 * The delivery-discount promise, and the basket size that earns it.
 *
 * The number is deliberately NOT the delivery fee out of site settings. It is
 * the minimum order value the discount needs — a different figure that merely
 * happens to sit at the same 3,000 today. Reading `deliveryFeeDefault` for it
 * would mean changing the delivery PRICE in the dashboard silently moved the
 * THRESHOLD shoppers are being promised, which is the opposite of what either
 * number means.
 *
 * A constant rather than a setting because there is no dashboard control for a
 * minimum-order threshold to read from; the admin's switch over this banner is
 * whether it shows at all. Change the figure here.
 */
const MIN_ORDER_VALUE = 3000;

export function DeliveryNotice() {
  const { t, lang } = useStore();

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
          {formatPrice(MIN_ORDER_VALUE, lang)}
        </span>
      </div>
    </section>
  );
}
