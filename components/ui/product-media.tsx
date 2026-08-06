"use client";

import { useState } from "react";
import Image from "next/image";
import { OfflineNotice } from "@/components/ui/offline-notice";
import { useRetryingImage } from "@/lib/hooks/use-retrying-image";
import type { Product } from "@/lib/products";

type CSSVars = React.CSSProperties & Record<string, string>;

/**
 * A tiny SVG tinted with the product's own accent colour, used as the blur
 * placeholder while the real photo arrives — so a slot fades in from the
 * product's colour instead of flashing empty.
 *
 * Built inline (no network request, no build step) and URL-encoded rather than
 * base64 so it works identically on the server and in the browser.
 */
export function tintedBlurDataUrl(color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
    `<rect width="8" height="8" fill="${color}" opacity="0.22"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Product visual. Renders the photo when there is one, otherwise the brand
 * emoji tile. The accent colour drives the tinted background via color-mix, so
 * it adapts to dark mode.
 *
 * Loading is deliberately staged: the tile is already filled with the product's
 * colour, the blur placeholder sits on top, and the photo cross-fades in once
 * decoded — no white flash, no pop, and no layout shift (the box is sized by
 * its parent, not by the image).
 *
 * `priority` images skip the fade: they're the largest paint on the screen, and
 * starting them transparent would delay how soon the page looks ready.
 */
export function ProductMedia({
  product,
  name,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  priority = false,
  emojiClassName = "text-5xl",
}: {
  product: Product;
  name: string;
  sizes?: string;
  priority?: boolean;
  emojiClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const { src, failed, onError } = useRetryingImage(product.image ?? undefined);
  const style: CSSVars = {
    "--c": product.color,
    background: "color-mix(in srgb, var(--c) 11%, var(--surface))",
  };
  const fading = !priority && !loaded;

  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden" style={style}>
      <span className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: "var(--c)" }} />
      {src && !failed ? (
        <Image
          src={src}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          placeholder="blur"
          blurDataURL={tintedBlurDataUrl(product.color)}
          onLoad={() => setLoaded(true)}
          onError={onError}
          // `motion-reduce` keeps the fade out of the way for anyone who's
          // asked the OS to limit animation.
          className={`object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none ${
            fading ? "opacity-0" : "opacity-100"
          }`}
        />
      ) : failed ? (
        // A photo that exists but wouldn't load is a connection problem worth
        // naming — unlike a product with no photo at all, where the emoji tile
        // is the intended look rather than a failure.
        <span className="absolute inset-0">
          <OfflineNotice />
        </span>
      ) : (
        <span className={`${emojiClassName} transition-transform duration-300 group-hover:scale-110`}>
          {product.emoji}
        </span>
      )}
    </div>
  );
}
