"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ChevronDown } from "@/components/icons";
import { useCatalog } from "@/components/providers/store-provider";

/**
 * A free-text note, clamped to a few lines with a disclosure arrow that only
 * appears when the clamp actually cut something off.
 *
 * Order notes are the one field on an order that nobody can predict the length
 * of: "waterproof" and three paragraphs of cutting instructions arrive through
 * the same box. Truncating them to a single ellipsis lost the half that mattered
 * — an admin reading "please cut the brooch in a circle along the…" has been
 * told nothing — while letting them run full-length pushed the price and the
 * artwork off the row on a phone.
 *
 * So: clamp, and offer the rest. The arrow is rendered ONLY when the text is
 * genuinely clipped, measured against the live layout rather than guessed from a
 * character count — the same note is one line on a laptop and four on a phone,
 * and a permanent "show more" on a note that is already fully visible is noise
 * that trains people to ignore the one time it means something.
 *
 * Not italic, deliberately. Cairo ships no italic face, so `font-style: italic`
 * gets synthesised by the browser — a mechanical slant that Arabic in particular
 * reads badly at these sizes, on exactly the note that most needed reading. The
 * quote marks and the start-edge rule carry the "this is quoted from a person"
 * job instead, and they cost no legibility.
 */
export function ExpandableNote({
  text,
  lines = 2,
  className = "",
}: {
  text: string;
  /** How many lines to show before cutting. */
  lines?: number;
  /**
   * Goes on the wrapper. Size and colour are inherited by the note body, so the
   * caller styles this the way it styled the paragraph this replaced — but the
   * disclosure button keeps its own smaller type rather than growing with it.
   */
  className?: string;
}) {
  const { t } = useCatalog();
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef<HTMLSpanElement>(null);

  /**
   * Is the clamp hiding anything?
   *
   * Runs only while collapsed: an expanded note is by definition not clipped, so
   * measuring one would answer "no" and take the arrow away mid-read, stranding
   * the visitor in a note they can no longer fold up. `clipped` therefore stays
   * as it was until they collapse it again, and the arrow keeps its second job.
   *
   * `clipped` is in the dependency list because the arrow appearing changes the
   * width the text has to live in. Re-measuring after that settles rather than
   * oscillates: a narrower box can only ever be MORE clipped, never less.
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || open) return;

    let cancelled = false;
    // A pixel of slack: sub-pixel line heights make scrollHeight overshoot
    // clientHeight by a fraction on a note that fits perfectly.
    const measure = () => {
      if (!cancelled) setClipped(el.scrollHeight > el.clientHeight + 1);
    };

    measure();

    // Rotating the phone, opening the drawer, resizing the modal — the same note
    // is clipped at one width and whole at another.
    const observer = new ResizeObserver(measure);
    observer.observe(el);

    // The webfont swapping in re-flows the text without changing the box, so the
    // observer never hears about it. Cairo is a download on every first visit and
    // this shop's visitors are on slow mobile data, which makes that swap the
    // common case rather than the edge one.
    document.fonts?.ready.then(measure).catch(() => {});

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [open, clipped, text, lines]);

  /**
   * `-webkit-box` rather than a `line-clamp-N` class: the line count is a prop,
   * and Tailwind only emits the classes it can find written out in the source.
   */
  const clamp: CSSProperties | undefined = open
    ? undefined
    : {
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
      };

  return (
    // A <span> so this is legal inside the phrasing-only containers it drops
    // into (the item rows are spans all the way down).
    <span className={`block ${className}`}>
      <span
        id={bodyId}
        ref={bodyRef}
        // Notes are typed by hand into a textarea; the line breaks a person put
        // there are part of what they meant.
        className="block whitespace-pre-line border-s-2 border-line-2 ps-2 leading-relaxed"
        style={clamp}
      >
        &ldquo;{text}&rdquo;
      </span>
      {clipped && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={bodyId}
          // ms-2.5 lines the button up under the text rather than under the
          // quote rule: 2px of border plus the body's 0.5rem of padding.
          className="tap ms-2.5 mt-1 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-3 transition hover:bg-brand-soft hover:text-brand"
        >
          <ChevronDown
            size={11}
            className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
          {t(open ? "text.less" : "text.more")}
        </button>
      )}
    </span>
  );
}
