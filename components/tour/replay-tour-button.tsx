"use client";

import { useCatalog } from "@/components/providers/store-provider";
import { useTour } from "@/components/tour/tour-provider";
import { Info } from "@/components/icons";

/**
 * Footer control that replays the walkthrough on demand — the tour auto-runs
 * only once, so this is how anyone gets back to it (or reaches it at all, on a
 * device where it already ran).
 *
 * Stays mounted while the tour is running, unlike an ordinary control behind the
 * scrim: the walkthrough's closing step spotlights this very button to show
 * where it lives. Hiding it then would leave that step pointing at nothing.
 */
export function ReplayTourButton() {
  const { t } = useCatalog();
  const { start } = useTour();

  return (
    <button
      type="button"
      data-tour="replay"
      onClick={start}
      className="tap inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-ink-2 transition hover:border-brand hover:bg-brand-soft hover:text-brand"
    >
      <Info size={14} />
      {t("tour.replay")}
    </button>
  );
}
