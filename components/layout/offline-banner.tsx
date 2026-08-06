"use client";

import { useEffect, useState } from "react";
import { WifiOff, Check } from "@/components/icons";
import { useStore } from "@/components/providers/store-provider";

/**
 * A single, unmissable statement of the problem.
 *
 * Per-image notices explain one empty slot; on a page full of them a shopper
 * still has to infer the pattern. This says it once, in a sentence, so nobody
 * has to work it out — and confirms recovery so the moment of "is it fixed?"
 * gets an answer too.
 *
 * Sits above everything else and clear of the phone's bottom tab bar.
 */
export function OfflineBanner() {
  const { t } = useStore();
  // "restored" is the brief all-clear; it only ever follows a real outage, so
  // someone who never dropped connection is never interrupted by it.
  const [status, setStatus] = useState<"online" | "offline" | "restored">("online");

  useEffect(() => {
    const goOffline = () => setStatus("offline");
    const goOnline = () => setStatus((s) => (s === "offline" ? "restored" : "online"));
    // Covers loading the page from cache while already disconnected.
    if (!navigator.onLine) goOffline();
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  useEffect(() => {
    if (status !== "restored") return;
    // Reassure, then get out of the way.
    const id = setTimeout(() => setStatus("online"), 3200);
    return () => clearTimeout(id);
  }, [status]);

  if (status === "online") return null;
  const online = status === "restored";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[95] flex justify-center px-4 md:bottom-6"
    >
      <div
        className={`flex animate-fade-in items-center gap-2.5 rounded-2xl px-4 py-2.5 text-center shadow-lg backdrop-blur ${
          online
            ? "bg-emerald-600/95 text-white"
            : "border border-line bg-ink/92 text-surface dark:bg-surface-2/95 dark:text-ink"
        }`}
      >
        {online ? (
          <Check size={17} className="shrink-0" />
        ) : (
          <WifiOff size={17} className="shrink-0 animate-pulse motion-reduce:animate-none" />
        )}
        <p className="text-[12.5px] font-bold leading-snug">
          {online ? t("net.backOnline") : t("net.offline")}
          {!online && (
            <span className="block text-[11px] font-semibold opacity-75">
              {t("net.checkOffline")}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
