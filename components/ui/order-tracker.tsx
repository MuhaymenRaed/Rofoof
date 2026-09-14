"use client";

import { useStore } from "@/components/providers/store-provider";
import { Check } from "@/components/icons";
import type { DictKey } from "@/lib/i18n";
import { statusStep, type OrderStatus } from "@/lib/products";

/**
 * The customer's view of the journey. Must stay in the same order as
 * `statusStep` in lib/products.ts — that map supplies the index into THIS
 * array, so a step added there without one here would point past the end.
 */
const STEPS: DictKey[] = [
  "step.pending",
  "step.accepted",
  "step.preparing",
  "step.shipping",
  "step.delivered",
];
const GREEN = "#22c55e";

export function OrderTracker({ status }: { status: OrderStatus }) {
  const { t } = useStore();
  const active = statusStep[status];

  return (
    <div className="flex items-start" dir="ltr">
      {STEPS.map((key, i) => {
        const done = i <= active;
        return (
          <div key={key} className="contents">
            <div className="flex flex-1 flex-col items-center">
              <div
                className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold transition"
                style={{
                  background: done ? GREEN : "var(--surface-3)",
                  color: done ? "#fff" : "var(--ink-3)",
                }}
              >
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span
                // Sized for FIVE steps on a 430px phone: the old 64px box fit
                // four across and started colliding at five. Width is capped in
                // percentage terms by the flex parent; this just stops a long
                // label bleeding into its neighbour.
                className="mt-1.5 max-w-[56px] text-center text-[9px] font-semibold leading-tight"
                style={{ color: done ? GREEN : "var(--ink-3)" }}
              >
                {t(key)}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className="mx-0.5 mt-3 h-[2px] flex-1 rounded transition"
                style={{ background: i < active ? GREEN : "var(--surface-3)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
