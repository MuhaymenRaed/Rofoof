"use client";

import { useStore } from "@/components/providers/store-provider";
import { Countdown } from "@/components/ui/countdown";
import { Tag } from "@/components/icons";

/**
 * The strip that says a product is on sale: how much is off, and — when a flash
 * offer is what makes it cheap — how long that lasts.
 *
 * Sized for a product card in a two-column phone grid, so the label and the
 * timer have to share roughly 130px: the label never wraps, and the timer gives
 * up its space first.
 */
export function DiscountBar({
  percent,
  endsAt,
}: {
  percent: number;
  /** ISO end of the flash offer behind the discount; omitted = no timer */
  endsAt?: string | null;
}) {
  const { t } = useStore();
  if (percent <= 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-hidden rounded-lg border border-brand-line bg-brand-soft px-2 py-1 text-brand">
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-black">
        <Tag size={11} />
        {t("offer.discount")} {percent}%
      </span>
      {endsAt && (
        <Countdown endsAt={endsAt} className="ms-auto truncate text-[9px] opacity-75" />
      )}
    </div>
  );
}
