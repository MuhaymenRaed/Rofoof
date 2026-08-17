"use client";

import { WifiOff } from "@/components/icons";
import { useCatalog } from "@/components/providers/store-provider";
import { useOnline } from "@/lib/hooks/use-online";

/**
 * What a shopper sees where a picture should have been.
 *
 * The point is to name the cause. A broken-image glyph reads as "this shop is
 * broken"; a struck-through Wi-Fi mark with a plain sentence reads as "my
 * connection dropped" — which is almost always the truth, and is something the
 * shopper can actually fix.
 *
 * It has to work everywhere a photo does, from a 32px order thumbnail to a
 * product card, so it sizes itself off its own container rather than the
 * viewport: the icon alone in a tiny slot, a headline once there's room to read
 * one, and the full instruction when there's room for that. No call site has to
 * pass a size, and the same component is legible at every one of them.
 *
 * Fills whatever box it's given — positioning belongs to the caller.
 *
 * Deliberately non-interactive: these slots sit inside product cards, gallery
 * thumbnails and order links, so a button here would nest inside a button or an
 * anchor — invalid HTML, and a tap would fire the wrong action. Recovery is
 * automatic when the connection returns instead, and the viewer offers an
 * explicit retry where there's room and nothing to nest inside.
 */
export function OfflineNotice() {
  const { t } = useCatalog();
  const online = useOnline();

  // Genuinely disconnected vs. a request that failed while nominally online —
  // both point at the connection, but only one of them can be stated flatly.
  const title = online ? t("net.imageFailed") : t("net.offline");
  const hint = online ? t("net.checkWeak") : t("net.checkOffline");

  return (
    <span
      // Opaque rather than frosted: there is no picture behind this to see
      // through (it's here because one failed), and a backdrop filter inside a
      // scrolling grid costs the compositor a readback per frame.
      className="@container grid h-full w-full place-items-center overflow-hidden bg-surface-2 text-center"
      role="status"
      // Reaches anyone who hovers, including at the icon-only size.
      title={`${title} — ${hint}`}
    >
      <span className="flex max-w-full animate-fade-in flex-col items-center gap-1.5 px-2 py-1 @min-[150px]:gap-2 @min-[150px]:px-4">
        {/* A slow pulse reads as "waiting on you" without a spinner's promise
            that something is already in progress. */}
        <WifiOff className="h-5 w-5 shrink-0 animate-pulse text-ink-3 motion-reduce:animate-none @min-[90px]:h-7 @min-[90px]:w-7 @min-[220px]:h-10 @min-[220px]:w-10" />

        {/* Under ~110px there's no honest way to fit words — the icon and the
            tooltip carry it alone. */}
        <span className="hidden text-[11px] font-bold leading-tight text-ink-2 @min-[110px]:block @min-[220px]:text-[13px]">
          {title}
        </span>

        <span className="hidden text-[11px] leading-snug text-ink-3 @min-[190px]:block">
          {hint}
        </span>
      </span>
    </span>
  );
}
