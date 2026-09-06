"use client";

import { variantUrlFor } from "@/lib/media";

/**
 * The image "optimizer" — a pure function, and the whole free replacement for
 * a hosted one.
 *
 * `next/image` calls this once per candidate width while building `srcset`,
 * and uses whatever URL comes back verbatim. Nothing is proxied through
 * `/_next/image`, so Vercel's metered optimizer is never touched: no quota to
 * exhaust, no 402 to take the catalogue down, and the same behaviour on any
 * host. The resizing already happened in the admin's browser at upload time
 * (`lib/webp.ts`); this only decides which of those stored files to point at.
 *
 * The payoff is that every `sizes` prop already written across the app starts
 * working again. While `unoptimized` was set, `next/image` emitted a bare
 * `<img>` with no `srcset` at all, so `sizes="40px"` on an orders-board row
 * was inert and that row downloaded the full-size photo. Now the browser picks
 * from the real ladder and a 40px slot fetches the 400px file.
 *
 * `quality` is ignored on purpose: variants are encoded once at upload
 * (WEBP_QUALITY in `lib/webp.ts`), so there is nothing to re-encode here.
 */
export default function rofoofImageLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return variantUrlFor(src, width);
}
