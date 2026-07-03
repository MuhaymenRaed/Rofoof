"use client";

import { useStore } from "@/components/providers/store-provider";

export function Ticker() {
  const { t, announcement } = useStore();
  const items = announcement
    ? [announcement, t("ticker.line"), announcement, t("ticker.line")]
    : [t("ticker.promo"), t("ticker.line"), t("ticker.promo"), t("ticker.line")];

  return (
    <div className="overflow-hidden bg-brand text-white">
      <div className="flex w-max animate-marquee whitespace-nowrap py-2 hover:[animation-play-state:paused]">
        {[...items, ...items].map((text, i) => (
          <span
            key={i}
            className="mx-6 inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.12em]"
          >
            <span aria-hidden>✦</span>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
