"use client";

import { useEffect, useRef, useState } from "react";

export interface PageResult<T> {
  items: T[];
  hasMore: boolean;
}

/**
 * Real, server-backed infinite scroll: appends the next page (fetched via
 * `loadMore`) as a sentinel element scrolls into view (IntersectionObserver).
 * Unlike client-only reveal, this never pulls the entire table into memory —
 * each scroll fetches only the next chunk. Used for the dashboard's
 * unboundedly-growing lists (orders, inventory, customers).
 */
export function usePaginatedList<T>(
  initialItems: T[],
  initialHasMore: boolean,
  loadMore: (offset: number) => Promise<PageResult<T>>,
) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Read fresh state/callback from inside the observer without recreating it.
  // Written in an effect (not during render) — refs must only be touched
  // outside of render.
  const stateRef = useRef({ items, hasMore, loading });
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    stateRef.current = { items, hasMore, loading };
    loadMoreRef.current = loadMore;
  });

  // Re-seed when the server gives fresh initial data (e.g. after router.refresh()).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setItems(initialItems);
    setHasMore(initialHasMore);
  }, [initialItems, initialHasMore]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const { items: current, hasMore: more, loading: busy } = stateRef.current;
        if (busy || !more) return;
        setLoading(true);
        loadMoreRef
          .current(current.length)
          .then(({ items: next, hasMore: nextHasMore }) => {
            setItems((prev) => [...prev, ...next]);
            setHasMore(nextHasMore);
          })
          .finally(() => setLoading(false));
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { items, hasMore, loading, sentinelRef, setItems };
}
