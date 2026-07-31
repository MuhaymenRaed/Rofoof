"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A value the user edits continuously (typing in a box, dragging a slider) that
 * is mirrored into the URL only after a short pause.
 *
 * Why: the URL is the source of truth for filters, but writing to it on every
 * keystroke would spam history and re-render on each character. This keeps the
 * control instant locally, commits once the user settles, and still adopts URL
 * changes that came from somewhere else (back/forward, a shared link).
 *
 * The `synced` ref is what makes it loop-proof: it records the last value the
 * two sides agreed on, so a commit we caused is never mistaken for an external
 * change (and vice-versa).
 */
export function useDebouncedUrlValue<T>(
  urlValue: T,
  commit: (value: T) => void,
  delay = 300,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(urlValue);
  const synced = useRef<T>(urlValue);

  // Keep the latest committer without re-arming the timer: `commit` closes over
  // the current search params, so its identity changes on every URL change.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  // Adopt an external URL change (back/forward, shared link, reset button).
  useEffect(() => {
    if (urlValue === synced.current) return;
    synced.current = urlValue;
    setValue(urlValue);
  }, [urlValue]);

  // Mirror local edits into the URL once the user pauses.
  useEffect(() => {
    if (value === synced.current) return;
    const id = setTimeout(() => {
      synced.current = value;
      commitRef.current(value);
    }, delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return [value, setValue];
}
