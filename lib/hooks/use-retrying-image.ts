"use client";

import { useEffect, useRef, useState } from "react";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 900;

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

  function onError() {
    if (state.failed || state.src !== src) return;
    if (state.attempt >= MAX_RETRIES) {
      setState((s) => ({ ...s, failed: true }));
      return;
    }
    const next = state.attempt + 1;
    timerRef.current = setTimeout(() => {
      // Ignore a timer left over from an image we've since navigated away from.
      setState((s) => (s.src === src ? { ...s, attempt: next } : s));
    }, RETRY_DELAY_MS * next);
  }

  const current = state.src === src ? state : { src, attempt: 0, failed: false };
  const resolvedSrc =
    src && current.attempt > 0
      ? `${src}${src.includes("?") ? "&" : "?"}retry=${current.attempt}`
      : src;

  return { src: current.failed ? undefined : resolvedSrc, failed: current.failed, onError };
}
