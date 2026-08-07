"use client";

import { useEffect, useRef, useState } from "react";

/**
 * How far outside the viewport an element already counts as "coming up".
 *
 * Roughly one extra screen in each direction. The browser's own lazy-loading
 * threshold is tuned for a leisurely scroll; a fast flick of a desktop wheel
 * outruns it, so the shopper arrives at a row of cards before their photos have
 * even been asked for and watches empty tiles fill in behind them. Asking a
 * screen early means the bytes are already on their way by the time the card
 * is looked at — and on a slow connection it buys that much more head start.
 */
const LEAD_MARGIN = "900px 0px";

/**
 * True once the element has come within {@link LEAD_MARGIN} of the viewport,
 * and true for good afterwards.
 *
 * This gates work that should START early and must never be undone — fetching a
 * photo — rather than visibility. Scrolling back up must not un-load anything.
 *
 * Where IntersectionObserver is missing it simply never fires, leaving the
 * caller on the browser's native lazy loading: later than we'd like, but the
 * same behaviour as before rather than none.
 */
export function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setNear(true);
        // One-shot: nothing below depends on the element leaving again, and a
        // live observer per card is a cost the scroll doesn't need to carry.
        observer.disconnect();
      },
      { rootMargin: LEAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, near] as const;
}
