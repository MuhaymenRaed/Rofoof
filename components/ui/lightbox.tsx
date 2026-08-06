"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ChevronEnd, WifiOff, Refresh } from "@/components/icons";
import { useStore } from "@/components/providers/store-provider";
import { RetryImage } from "@/components/ui/retry-image";
import { useOnline } from "@/lib/hooks/use-online";
import { useRetryingImage } from "@/lib/hooks/use-retrying-image";

/**
 * Full-screen image viewer: arrow keys / on-screen arrows / swipe to move
 * between images, Esc or backdrop tap to close. Arrows are always visible
 * (never hover-only) so they work on phones.
 */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
  alt = "",
}: {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  alt?: string;
}) {
  const { t } = useStore();
  const count = images.length;
  const touchX = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Bounded (no wrap): clamp to the first/last image so the ends are real ends.
  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < count) onIndex(next);
    },
    [index, count, onIndex],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setLoaded(false);
  }, [index]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL-agnostic: ArrowRight always advances visually to the next image
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, go]);

  // Resolved before the early return below — hooks can't run conditionally.
  const rawSrc = count > 0 ? images[Math.min(Math.max(index, 0), count - 1)] : undefined;
  const { src, failed, onError, retry } = useRetryingImage(rawSrc);
  const online = useOnline();

  if (typeof document === "undefined" || count === 0) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-black/92"
      style={{ animation: "fade-in 0.18s ease both" }}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between p-4 text-white">
        <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-bold tabular-nums">
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="tap grid h-10 w-10 place-items-center rounded-full bg-white/12 transition hover:bg-white/25"
        >
          <X size={20} />
        </button>
      </div>

      {/* Stage — tapping the backdrop closes, tapping the image does not */}
      <div className="relative flex flex-1 items-center justify-center px-3 pb-3" onClick={onClose}>
        <div
          className="relative h-full w-full max-w-4xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Full-size art can take a moment on a phone connection — show a
              quiet spinner rather than an empty black frame, and swap it for
              the picture only once it's actually decoded. */}
          {!loaded && !failed && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
            </span>
          )}
          {/* Retries exhausted. There's room here for the full explanation, and
              it's tuned for the dark backdrop rather than reusing the
              surface-toned notice the rest of the site shows. */}
          {failed && (
            <div className="absolute inset-0 grid animate-fade-in place-items-center px-6">
              <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10">
                  <WifiOff className="h-8 w-8 animate-pulse text-white/70 motion-reduce:animate-none" />
                </span>
                <p className="text-base font-bold text-white">
                  {online ? t("net.imageFailed") : t("net.offline")}
                </p>
                <p className="text-[13px] leading-relaxed text-white/60">
                  {online ? t("net.checkWeak") : t("net.checkOffline")}
                </p>
                <button
                  type="button"
                  onClick={retry}
                  className="tap mt-1 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/25"
                >
                  <Refresh size={15} />
                  {t("net.retry")}
                </button>
              </div>
            </div>
          )}
          {src && !failed && (
            <Image
              // Re-mounting per image resets the loading state, so moving between
              // pictures shows the spinner again instead of flashing the old one.
              key={src}
              src={src}
              alt={alt}
              fill
              sizes="100vw"
              onLoad={() => setLoaded(true)}
              onError={onError}
              className={`object-contain transition-opacity duration-300 motion-reduce:transition-none ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
              priority
            />
          )}
        </div>

        {/* Previous — hidden on the first image (no wrap). Arrow points outward
            toward the inline-start edge in both LTR and RTL. */}
        {index > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="previous"
            className="tap absolute start-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
          >
            <span className="rtl:rotate-180">
              <ChevronEnd size={20} />
            </span>
          </button>
        )}
        {/* Next — hidden on the last image. Arrow points outward toward the
            inline-end edge in both directions. */}
        {index < count - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="next"
            className="tap absolute end-3 grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/30"
          >
            <span className="ltr:rotate-180">
              <ChevronEnd size={20} />
            </span>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {count > 1 && (
        <div className="no-scrollbar flex shrink-0 justify-center gap-2 overflow-x-auto p-3">
          {images.map((thumb, i) => (
            <button
              key={thumb}
              type="button"
              onClick={() => onIndex(i)}
              aria-label={`${i + 1}`}
              aria-current={i === index}
              className={`tap relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === index ? "border-white" : "border-white/30 opacity-60 hover:opacity-100"
              }`}
            >
              <RetryImage src={thumb} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
