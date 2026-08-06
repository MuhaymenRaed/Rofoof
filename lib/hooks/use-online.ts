"use client";

import { useEffect, useState } from "react";

/**
 * The browser's connectivity flag, kept live via the online/offline events.
 *
 * Starts optimistic: `navigator` doesn't exist while the page is rendered on
 * the server, so assuming "online" keeps the first client render identical to
 * the server's and avoids a hydration mismatch. The effect corrects it
 * immediately on mount for anyone who was already offline.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    // Correct the optimistic default for someone who loaded from cache offline.
    if (!navigator.onLine) sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return online;
}
