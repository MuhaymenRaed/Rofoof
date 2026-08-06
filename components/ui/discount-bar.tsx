"use client";

import { useStore } from "@/components/providers/store-provider";
import { Tag } from "@/components/icons";

/**
 * The strip that says a product is on sale, and by how much.
 *
 * No countdown here: on a card in a two-column phone grid the timer and the
 * label fight over ~130px, and a per-card ticking clock turns a grid of 83
 * products into a wall of noise. The deadline lives in the quick view, where
 * the shopper is actually deciding.
 */
export function DiscountBar({ percent }: { percent: number }) {
  const { t } = useStore();
  if (percent <= 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-hidden rounded-lg border border-brand-line bg-brand-soft px-2 py-1 text-[10px] font-black text-brand">
      <Tag size={11} />
      {t("offer.discount")} {percent}%
    </div>
  );
}
