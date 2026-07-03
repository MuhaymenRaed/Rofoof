"use client";

import { Plus, Minus } from "@/components/icons";

export function QtyStepper({
  value,
  onChange,
  min = 1,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "h-7 w-7"
      : "h-9 w-9";
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface-2 p-1">
      <button
        type="button"
        aria-label="−"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className={`tap grid ${btn} place-items-center rounded-lg text-ink-2 transition hover:bg-surface hover:text-brand disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Minus size={size === "sm" ? 14 : 16} />
      </button>
      <span className="w-8 text-center text-sm font-extrabold tabular-nums text-ink">{value}</span>
      <button
        type="button"
        aria-label="+"
        onClick={() => onChange(value + 1)}
        className={`tap grid ${btn} place-items-center rounded-lg text-ink-2 transition hover:bg-surface hover:text-brand`}
      >
        <Plus size={size === "sm" ? 14 : 16} />
      </button>
    </div>
  );
}
