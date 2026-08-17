"use client";

import { useCatalog } from "@/components/providers/store-provider";
import { useTour } from "@/components/tour/tour-provider";
import { Info } from "@/components/icons";

/**
 * Footer control that replays the walkthrough on demand — the tour auto-runs
 * only once, so this is how anyone gets back to it (or reaches it at all, on a
 * device where it already ran).
 *
 * Hidden while the tour is on screen: the footer sits behind the scrim, so a
 * button there would be a control the visitor can see but not press.
 */
export function ReplayTourButton() {
  const { t } = useCatalog();
  const { start, active } = useTour();

  if (active) return null;

  return (
    <button
      type="button"
      onClick={start}
      className="tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
    >
      <Info size={14} />
      {t("tour.replay")}
    </button>
  );
}
