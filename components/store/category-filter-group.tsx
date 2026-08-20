"use client";

import { memo } from "react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Check, Plus } from "@/components/icons";
import type { SubcategoryInfo } from "@/lib/products";

/**
 * Which accent a filter box wears. The two boxes are the same control doing two
 * different jobs — "what is it" and "what is it about" — and colour is what
 * says they combine rather than compete, before any label is read.
 */
export type FilterTone = "brand" | "sky";

/**
 * Whole class strings per tone, never built by concatenation: Tailwind reads
 * source text, so a `border-${tone}` would compile to nothing at all.
 */
const TONE: Record<
  FilterTone,
  {
    panel: string;
    mark: string;
    chipOn: string;
    chipOff: string;
    divider: string;
    /** divider inside a SELECTED chip, which is filled with the accent */
    dividerOn: string;
    subOn: string;
    subOff: string;
    pill: string;
  }
> = {
  brand: {
    panel: "border-brand-line bg-brand-soft",
    mark: "bg-brand text-white",
    chipOn: "border-brand bg-brand text-white shadow-sm",
    chipOff:
      "border-line bg-surface text-ink-2 hover:border-brand hover:bg-brand-soft hover:text-brand",
    divider: "border-brand-line",
    dividerOn: "border-white/30",
    subOn: "bg-brand text-white",
    subOff: "text-ink-2 hover:bg-brand-soft hover:text-brand",
    pill: "bg-white/25 text-white",
  },
  // Everything a filled sky chip draws on top of itself goes through
  // accent-2-ink rather than white: the accent is a LIGHT blue in dark mode, so
  // white-on-blue would be about 2:1 there. See app/globals.css.
  sky: {
    panel: "border-accent-2-line bg-accent-2-soft",
    mark: "bg-accent-2 text-accent-2-ink",
    chipOn: "border-accent-2 bg-accent-2 text-accent-2-ink shadow-sm",
    chipOff:
      "border-line bg-surface text-ink-2 hover:border-accent-2 hover:bg-accent-2-soft hover:text-accent-2",
    divider: "border-accent-2-line",
    dividerOn: "border-accent-2-ink/25",
    subOn: "bg-accent-2 text-accent-2-ink",
    subOff: "text-ink-2 hover:bg-accent-2-soft hover:text-accent-2",
    pill: "bg-accent-2-ink/15 text-accent-2-ink",
  },
};

export interface FilterChip {
  code: string;
  label: string;
  icon: string;
}

interface Props {
  tone: FilterTone;
  title: string;
  hint: string;
  /** header glyph — the box's own icon, not a category's */
  icon: React.ReactNode;
  /** label for the reset chip that clears THIS box only */
  allLabel: string;
  chips: FilterChip[];
  /** selected codes belonging to this box */
  active: string[];
  /** category code → its subcategories, for the merged + control */
  subsByCat: Map<string, SubcategoryInfo[]>;
  activeSubcategories: string[];
  subLabel: (code: string) => string;
  subMenuLabel: string;
  /** which chip's subcategory menu is open (shared across both boxes) */
  openMenuFor: string | null;
  onOpenMenu: (code: string | null) => void;
  onToggle: (code: string) => void;
  onClearGroup: () => void;
  onToggleSub: (code: string) => void;
  onClearSubsOf: (code: string) => void;
}

/**
 * One box of the store's split category filter.
 *
 * Both boxes are OR internally and AND against each other, which is exactly
 * what the framing communicates: two enclosed groups, each with its own accent,
 * instead of one undifferentiated run of chips where "stickers" and "games"
 * looked like the same kind of choice.
 *
 * Memoised because the store re-renders on every keystroke in the search field,
 * and these two boxes hold every chip in the shop.
 */
function CategoryFilterGroupImpl({
  tone,
  title,
  hint,
  icon,
  allLabel,
  chips,
  active,
  subsByCat,
  activeSubcategories,
  subLabel,
  subMenuLabel,
  openMenuFor,
  onOpenMenu,
  onToggle,
  onClearGroup,
  onToggleSub,
  onClearSubsOf,
}: Props) {
  const c = TONE[tone];
  const noneSelected = active.length === 0;

  return (
    <section className={`rounded-2xl border p-3 transition-colors sm:p-4 ${c.panel}`}>
      <header className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${c.mark}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-black leading-tight text-ink">{title}</h3>
          <p className="truncate text-[10.5px] leading-tight text-ink-3">{hint}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {/* Reset chip — clears this box alone, leaving the other one standing */}
        <button
          type="button"
          onClick={onClearGroup}
          aria-pressed={noneSelected}
          className={`tap inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
            noneSelected ? c.chipOn : c.chipOff
          }`}
        >
          <CategoryIcon name="grid" size={15} />
          {allLabel}
        </button>

        {chips.map((chip) => {
          const on = active.includes(chip.code);
          const subs = subsByCat.get(chip.code) ?? [];
          const menuOpen = openMenuFor === chip.code;
          const picked = activeSubcategories.filter((s) =>
            subs.some((sub) => sub.code === s),
          );

          return (
            <div key={chip.code} className="relative">
              <div
                className={`flex items-stretch overflow-hidden rounded-xl border transition ${
                  on || menuOpen ? c.chipOn : c.chipOff
                }`}
              >
                <button
                  type="button"
                  onClick={() => onToggle(chip.code)}
                  aria-pressed={on}
                  className="tap inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold"
                >
                  <CategoryIcon name={chip.icon} size={15} />
                  {chip.label}
                  {picked.length > 0 && (
                    <span
                      className={`ms-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                        on ? c.pill : c.mark
                      }`}
                    >
                      {picked.length === 1 ? subLabel(picked[0]) : picked.length}
                    </span>
                  )}
                </button>
                {subs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenMenu(menuOpen ? null : chip.code)}
                    aria-label={subMenuLabel}
                    aria-expanded={menuOpen}
                    className={`tap grid w-8 place-items-center border-s ${
                      on || menuOpen ? c.dividerOn : c.divider
                    }`}
                  >
                    <Plus
                      size={14}
                      className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : ""}`}
                    />
                  </button>
                )}
              </div>

              {menuOpen && subs.length > 0 && (
                <>
                  {/* click-away layer */}
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => onOpenMenu(null)}
                    className="fixed inset-0 z-20 cursor-default"
                  />
                  <div className="absolute z-30 mt-2 max-h-64 min-w-[190px] animate-pop overflow-y-auto rounded-xl border border-line-2 bg-surface p-1.5 shadow-2xl">
                    <SubItem
                      label={allLabel}
                      on={picked.length === 0}
                      onClick={() => onClearSubsOf(chip.code)}
                      tone={c}
                    />
                    {subs.map((s) => (
                      <SubItem
                        key={s.code}
                        label={subLabel(s.code)}
                        on={activeSubcategories.includes(s.code)}
                        onClick={() => onToggleSub(s.code)}
                        tone={c}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export const CategoryFilterGroup = memo(CategoryFilterGroupImpl);

/** One row in a chip's subcategory dropdown. */
function SubItem({
  label,
  on,
  onClick,
  tone,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  tone: (typeof TONE)[FilterTone];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-xs font-bold transition ${
        on ? tone.subOn : tone.subOff
      }`}
    >
      {label}
      {on && <Check size={14} className="shrink-0" />}
    </button>
  );
}
