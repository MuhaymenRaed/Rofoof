"use client";

import Image, { type ImageProps } from "next/image";
import { useRetryingImage } from "@/lib/hooks/use-retrying-image";

/**
 * next/image that survives a dropped request. Same props, except `src` must be
 * a string and a `fallback` can be rendered once the retries are exhausted —
 * anything is better than the browser's broken-image glyph.
 */
export function RetryImage({
  src,
  alt,
  fallback = null,
  onLoad,
  ...rest
}: Omit<ImageProps, "src"> & { src: string; fallback?: React.ReactNode }) {
  const retry = useRetryingImage(src);
  if (!retry.src || retry.failed) return <>{fallback}</>;
  return <Image {...rest} alt={alt} src={retry.src} onLoad={onLoad} onError={retry.onError} />;
}
