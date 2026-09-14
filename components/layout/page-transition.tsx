"use client";

import { usePathname } from "next/navigation";

/**
 * A short settle on the main content whenever the route changes.
 *
 * Navigating used to be a hard cut: one page's markup was simply replaced by
 * the next, with nothing to say that anything had happened. On a phone, where
 * the tab bar is the primary way around the shop, that made every tap feel like
 * a redraw rather than a move.
 *
 * `key={pathname}` is the whole mechanism — React unmounts the old subtree and
 * mounts the new one, which restarts the CSS animation. No transition library,
 * no route interception, nothing to keep in sync with the router.
 *
 * WHY `children` STAYS A PROP: this is a Client Component, but the pages it
 * wraps are Server Components. Passing them through as `children` keeps them
 * server-rendered — rendering them *inside* this file would drag the whole
 * catalogue across the client boundary. The boundary sits around them, not
 * through them.
 *
 * The animation itself is `rise`, at the shared duration, and stops entirely
 * under `prefers-reduced-motion` via the blanket rule in globals.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-rise">
      {children}
    </div>
  );
}
