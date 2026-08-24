"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "@/components/icons";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A select that looks like the rest of the shop.
 *
 * A native `<select>` renders its list with the OS's own widget — which on
 * Windows and Android ignores the site's colours entirely, so the dashboard's
 * one dropdown was a slab of system-grey in an otherwise themed page, and in
 * dark mode it came out white. This is the same control drawn in the app's own
 * surfaces, and it stays keyboard-reachable: it is a real button, the list is a
 * `listbox`, Escape closes it and the current value is marked `aria-selected`.
 *
 * Deliberately NOT a full ARIA combobox with arrow-key roving focus — the lists
 * here are five items long, every option is a plain button in the tab order,
 * and the extra machinery would be more to get subtly wrong than it is worth.
 */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (next: T) => void;
  /** Accessible name — this control has no visible <label> of its own. */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  // Close on Escape, and on a click that lands outside the whole control —
  // `mousedown` rather than `click` so it beats the option's own handler and
  // can't swallow the very selection the visitor is making.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="tap flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-bold text-ink transition hover:border-brand"
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          // end-0 + min-w-full: the panel hangs from the control's trailing
          // edge and is never narrower than it, so a long option can widen the
          // list without the trigger jumping around. z-30 clears the sticky
          // section headers it opens over.
          className="absolute end-0 z-30 mt-1.5 max-h-64 min-w-full overflow-y-auto rounded-xl border border-line-2 bg-surface p-1 shadow-2xl"
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`tap flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-start text-xs font-bold transition ${
                    selected ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  <span className="w-3.5 shrink-0">{selected && <Check size={13} />}</span>
                  <span className="whitespace-nowrap">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
