"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCatalog } from "@/components/providers/store-provider";
import { formatPrice } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/theme-swap";

/** One rung: "this many pieces or more → this unit price". */
export interface LadderRung {
  minQty: number;
  unitPrice: number;
}

/**
 * The by-count price ladder, as the shopper sees it.
 *
 * What this replaced was a row of boxes reading "+1 +2 +3 +4" over a bare
 * number, and it told a shopper nothing: no currency, no "each", and nothing
 * anywhere saying that the count is what moves the price. People were finding
 * out what they would actually pay only after adding to the cart, which is the
 * worst possible moment — it reads as the shop changing its mind about the price.
 *
 * So every rung now spells out both halves of the deal, in the shop's currency,
 * and the header carries the one sentence that makes the boxes mean anything.
 *
 * Used for both ladders in the shop, which are NOT the same thing:
 *  • the global by-count ladder, whose count is pooled across the whole cart, and
 *  • a single product's own tier ladder, whose count is just that line.
 * `hint` is what tells them apart, so it is required rather than defaulted — the
 * pooled one in particular is impossible to guess and worth real estate.
 */
export function PriceLadder({
  rungs,
  count,
  hint,
}: {
  rungs: readonly LadderRung[];
  /** Pieces counted toward this ladder right now — decides the lit rung. */
  count: number;
  /** One line saying what makes the price move. */
  hint: string;
}) {
  const { t, lang } = useCatalog();
  const scroller = useRef<HTMLDivElement>(null);
  const activeCell = useRef<HTMLDivElement>(null);

  const sorted = useMemo(() => [...rungs].sort((a, b) => a.minQty - b.minQty), [rungs]);

  /**
   * Which rung the shopper is standing on.
   *
   * Deliberately the same rule as `volumeUnitPrice` in lib/pricing.ts, which in
   * turn mirrors `place_order`: the highest rung the count has reached, and the
   * lowest rung when it has reached none. This used to be decided by comparing
   * the resolved unit PRICE against each rung's price, which lit up two rungs at
   * once whenever an admin gave them the same figure.
   */
  const activeMin = useMemo(() => {
    let best = sorted[0]?.minQty ?? 0;
    for (const r of sorted) if (r.minQty <= count) best = r.minQty;
    return best;
  }, [sorted, count]);

  const activeRung = sorted.find((r) => r.minQty === activeMin);
  /** The starting price, which every rung's saving is measured against. */
  const openingPrice = sorted[0]?.unitPrice ?? 0;

  /**
   * Bring the lit rung into view when the count moves the shopper along a ladder
   * too wide for the screen — a highlight scrolled off the end is no highlight.
   *
   * `scrollBy` on the strip rather than `scrollIntoView` on the cell: the latter
   * walks up the ancestors and would drag the modal's own scroll position around
   * to bring the ladder into frame, and it reasons in `scrollLeft`, whose sign
   * flips between engines in RTL. A delta in visual pixels has neither problem.
   */
  useEffect(() => {
    const box = scroller.current;
    const cell = activeCell.current;
    if (!box || !cell) return;
    if (box.scrollWidth <= box.clientWidth) return;
    const boxRect = box.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const delta = cellRect.left + cellRect.width / 2 - (boxRect.left + boxRect.width / 2);
    if (Math.abs(delta) < 1) return;
    box.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [activeMin]);

  if (sorted.length === 0) return null;

  return (
    // shrink-0 is load-bearing, not decorative. This sits in the quick-view
    // modal's `flex flex-col overflow-y-auto` body — and per the flexbox spec,
    // a flex item with any `overflow` other than `visible` gets an automatic
    // minimum size of 0, so a package product with enough content above this
    // (the design picker) to push the modal past its max-height was squashing
    // the WHOLE ladder down to a couple of pixels instead of just letting the
    // body scroll, hiding the very price the by-count rewrite exists to show.
    <div className="mt-4 shrink-0 overflow-hidden rounded-xl border border-line-2">
      <div className="bg-surface-2 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-[11px] font-bold text-ink-2">{t("product.tierTable")}</p>
          {/* The answer to "what am I paying", stated once and in full, so it
              doesn't have to be read out of the highlighted box. */}
          {activeRung && (
            <p className="text-[11px] font-bold text-ink-3">
              {t("product.ladderNow")}{" "}
              <span className="font-black text-brand">
                {formatPrice(activeRung.unitPrice, lang)}
              </span>{" "}
              {t("product.perUnit")}
            </p>
          )}
        </div>
        <p className="mt-0.5 text-[10px] leading-relaxed text-ink-3">{hint}</p>
      </div>

      {/* Scrolls instead of cramping when the admin adds many rungs.
          Separators are a 1px GAP letting this row's own background show
          through, not `divide-x`: that utility skips the first child and hangs
          its border on the neighbour, so the edge beside the lit rung — whose
          tinted `bg-brand-soft` sits right up against it — read as no line at
          all. A gap can't be swallowed by an adjacent background, so every
          pair is separated identically whichever rung is lit. */}
      <div
        ref={scroller}
        className="no-scrollbar flex gap-px overflow-x-auto bg-line-2"
      >
        {sorted.map((rung) => {
          const active = rung.minQty === activeMin;
          // Only ever shown when it is a real saving: a ladder an admin has
          // entered out of order would otherwise sprout a "-0%" or a rise.
          const saved =
            openingPrice > 0
              ? Math.round(((openingPrice - rung.unitPrice) / openingPrice) * 100)
              : 0;
          return (
            <div
              key={rung.minQty}
              ref={active ? activeCell : undefined}
              aria-current={active ? "true" : undefined}
              // An explicit background on every cell, because the 1px gaps
              // between them are only visible as lines while the cells
              // themselves are opaque.
              className={`relative min-w-24 flex-1 shrink-0 px-2 pb-2 pt-2.5 text-center transition ${
                active ? "bg-brand-soft" : "bg-surface"
              }`}
            >
              {/* A bar rather than a border, so the lit rung reads at a glance
                  without the cell's width shifting when it changes. */}
              {active && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" />}
              <p className="text-[10px] font-bold text-ink-3">
                <span dir="ltr">{rung.minQty}+</span> {t("cart.pieces")}
              </p>
              <p className={`text-[12px] font-black ${active ? "text-brand" : "text-ink"}`}>
                {formatPrice(rung.unitPrice, lang)}
              </p>
              {saved > 0 && (
                <p dir="ltr" className="text-[9px] font-black text-emerald-600">
                  -{saved}%
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
