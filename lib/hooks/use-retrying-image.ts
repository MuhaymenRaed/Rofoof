"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long to wait before each retry, in ms.
 *
 * The tail is deliberately long. On the mobile connections this shop is
 * actually used on, a drop routinely takes several seconds to clear — giving up
 * inside of three would abandon shoppers whose signal was about to come back.
 * Waiting costs nothing here: images load lazily and nothing blocks on them.
 */
const RETRY_DELAYS_MS = [900, 1800, 3000, 5500, 8000];
const MAX_RETRIES = RETRY_DELAYS_MS.length;

/**
 * Product photos are served straight from Supabase Storage — no optimizer or
 * cache sits in front to absorb a dropped connection or a cold CDN edge, and
 * next/image never retries a request it lost. Without this, one transient blip
 * leaves a permanent broken-image icon until the shopper reloads the page.
 *
 * Retries a few times with a widening delay, cache-busting where a negatively
 * cached response could otherwise pin the failure in place, and only reports
 * `failed` once the retries are genuinely spent.
 *
 * Which *size* gets requested is not this hook's business — the custom image
 * loader and the `sizes` prop settle that before the browser asks for
 * anything. This only decides whether to ask again.
 */
export function useRetryingImage(src: string | undefined) {
  const [state, setState] = useState({ src, attempt: 0, failed: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pointed at a different picture: start it clean. Adjusting state during
  // render (rather than in an effect) means the new image never gets requested
  // once with the previous one's retry counter attached.
  if (state.src !== src) setState({ src, attempt: 0, failed: false });

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  /**
   * Give up on the giving-up: one more attempt with a fresh cache-buster.
   * Bumping the counter past the limit means a still-broken image settles back
   * into the failed state after a single try rather than looping forever.
   */
  const retry = useCallback(() => {
    setState((s) => (s.failed ? { ...s, attempt: s.attempt + 1, failed: false } : s));
  }, []);

  // The connection coming back is the signal we were waiting for — reload the
  // picture the moment it does, so a shopper who fixes their Wi-Fi sees the
  // page heal itself instead of having to know to refresh.
  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  /**
   * Memoized because next/image rebuilds its internal ref callback whenever
   * `onError` changes identity, and React re-attaching that ref makes the
   * component re-assign the <img>'s own src. The browser treats that as a new
   * load: it drops the picture it was already showing and fetches it again, so
   * the tile blinks empty and fades back in.
   *
   * A fresh function every render meant that happened on EVERY re-render — the
   * offer clock ticking, an item going into the cart, a heart being toggled —
   * blanking every photo on screen at once for no reason.
   */
  const onError = useCallback(() => {
    if (state.failed || state.src !== src) return;

    if (state.attempt >= MAX_RETRIES) {
      setState((s) => ({ ...s, failed: true }));
      return;
    }

    const next = state.attempt + 1;
    const delay = RETRY_DELAYS_MS[state.attempt] ?? RETRY_DELAYS_MS[MAX_RETRIES - 1];
    timerRef.current = setTimeout(() => {
      // Ignore a timer left over from an image we've since navigated away from.
      setState((s) => (s.src === src ? { ...s, attempt: next } : s));
    }, delay);
  }, [state, src]);

  const current = state.src === src ? state : { src, attempt: 0, failed: false };

  /**
   * The cache-buster starts at the SECOND retry, not the first.
   *
   * Every busted URL is a distinct object to the CDN: a guaranteed miss, a
   * fresh pull from storage, and a fresh charge — so the old behaviour billed
   * up to five full downloads for one photo on exactly the unstable mobile
   * connections this shop runs on. A dropped connection doesn't need a buster
   * to recover; only a negatively cached response does. Retrying the plain URL
   * once handles the common case for free and still reaches the buster if that
   * first retry fails too.
   *
   * The buster is appended to the query, which the loader carries across when
   * it swaps the width — so a retry still resolves to the right variant.
   */
  const resolvedSrc =
    src && current.attempt > 1
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${current.attempt}`
      : src;

  return { src: current.failed ? undefined : resolvedSrc, failed: current.failed, onError, retry };
}
