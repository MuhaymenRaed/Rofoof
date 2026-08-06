"use client";

import Image, { type ImageProps } from "next/image";
import { OfflineNotice } from "@/components/ui/offline-notice";
import { useRetryingImage } from "@/lib/hooks/use-retrying-image";

/**
 * next/image that survives a dropped request, and explains itself when it
 * can't. Same props, except `src` must be a string; pass `fallback` to override
 * what replaces the picture once the retries are spent.
 *
 * The default fallback names the likely cause (the connection) and offers a
 * retry, because the browser's broken-image glyph tells a shopper nothing.
 */
export function RetryImage({
  src,
  alt,
  fallback,
  onLoad,
  ...rest
}: Omit<ImageProps, "src"> & { src: string; fallback?: React.ReactNode }) {
  const retry = useRetryingImage(src);

  if (!retry.src || retry.failed) {
    if (fallback !== undefined) return <>{fallback}</>;
    // `fill` images sit in a positioned parent, so the notice can cover it.
    // Fixed-size ones get a box of the same dimensions, keeping the layout put.
    return rest.fill ? (
      <span className="absolute inset-0">
        <OfflineNotice />
      </span>
    ) : (
      <span
        className="inline-block overflow-hidden align-middle"
        style={{ width: rest.width, height: rest.height }}
      >
        <OfflineNotice />
      </span>
    );
  }

  return <Image {...rest} alt={alt} src={retry.src} onLoad={onLoad} onError={retry.onError} />;
}
