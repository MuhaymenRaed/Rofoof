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
 * Retries a few times with a widening delay, cache-busting each attempt so a
 * negatively-cached response can't pin the failure in place, and only reports
 * `failed` once the retries are genuinely spent.
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
    setState((s) => (s.failed ? { src: s.src, attempt: s.attempt + 1, failed: false } : s));
  }, []);

  // The connection coming back is the signal we were waiting for — reload the
  // picture the moment it does, so a shopper who fixes their Wi-Fi sees the
  // page heal itself instead of having to know to refresh.
  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);

  function onError() {
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
  }

  const current = state.src === src ? state : { src, attempt: 0, failed: false };
  const resolvedSrc =
    src && current.attempt > 0
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${current.attempt}`
      : src;

  return { src: current.failed ? undefined : resolvedSrc, failed: current.failed, onError, retry };
}
