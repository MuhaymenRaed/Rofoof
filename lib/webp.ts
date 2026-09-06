"use client";

/**
 * Client-side WebP conversion for user-submitted artwork. Images are
 * re-encoded (and gently downscaled) in the browser BEFORE upload, so the
 * storage bucket only ever holds compact WebP files instead of 10MB camera
 * originals — typically a 3–10× space saving with no server work.
 */

import { smallVariantsFor } from "@/lib/media";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB per source image
/**
 * Longest edge for artwork a customer sends us to PRODUCE — kept at print
 * resolution because the admin prints from this exact file.
 */
export const MAX_DIMENSION = 4096;
/**
 * Longest edge for catalogue photos, which are only ever *displayed* (largest
 * on-screen use is a full-width lightbox). Since images are served straight
 * from storage without a resizing step, keeping the source near display size
 * is what stops a 4K original being downloaded for a 64px thumbnail.
 */
export const DISPLAY_MAX_DIMENSION = 1600;
/**
 * 0.78 sits in the sweet spot: 60–80% smaller than the source PNG/JPEG with no
 * difference the eye can pick up at display sizes. Going higher mostly buys
 * bytes, not visible quality.
 */
const WEBP_QUALITY = 0.78;

/**
 * Uploaded files are immutable — every path carries a UUID or timestamp, so a
 * given URL always returns the same bytes. Caching them for a year means the
 * CDN answers repeat views instead of re-fetching from storage (the default is
 * only one hour, which quietly burns egress on files that never change).
 */
export const IMAGE_CACHE_CONTROL = "31536000"; // seconds = 365 days

export interface WebpResult {
  blob: Blob;
  /** always .webp when conversion succeeded; original extension otherwise */
  ext: string;
  contentType: string;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    img.src = url;
  });
}

/**
 * Draw an already-decoded image into a canvas capped at `maxDimension` on its
 * longest edge and encode it, or null if this browser can't.
 *
 * Split out from {@link toWebp} so several sizes can be produced from ONE
 * decode — decoding a 12MP phone photo is by far the expensive half, and the
 * shop runs on cheap Android hardware.
 *
 * Nothing downstream resizes or re-compresses (images are served straight from
 * storage), so what this produces is exactly what visitors download — which is
 * why the format fallback matters:
 *
 *   1. WebP — every current browser; smallest files.
 *   2. JPEG — if the browser can't encode WebP. Still RESIZED and compressed,
 *             so an old browser can't slip a 10MB original into the bucket.
 *
 * Drawing through a canvas also strips EXIF (orientation is already baked in
 * by the decoder), so no camera location data reaches the bucket.
 */
async function encodeAt(
  img: HTMLImageElement,
  maxDimension: number,
): Promise<WebpResult | null> {
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, WEBP_QUALITY));

  const webp = await encode("image/webp");
  // toBlob silently falls back to PNG when a type is unsupported, so confirm
  // what we actually got rather than trusting the request.
  if (webp && webp.type === "image/webp") {
    return { blob: webp, ext: "webp", contentType: "image/webp" };
  }

  const jpeg = await encode("image/jpeg");
  if (jpeg && jpeg.type === "image/jpeg") {
    return { blob: jpeg, ext: "jpg", contentType: "image/jpeg" };
  }

  return null;
}

/** The untouched upload, used when the canvas is unavailable or tainted. */
function asOriginal(file: File): WebpResult {
  return {
    blob: file,
    ext: (file.name.split(".").pop() || "jpg").toLowerCase(),
    contentType: file.type || "image/jpeg",
  };
}

/**
 * Re-encode an image to WebP, downscaled to `maxDimension` on its longest edge.
 *
 * Falls back to the original file only when the canvas itself is unavailable —
 * losing the customer's artwork would be worse than storing it fat.
 */
export async function toWebp(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<WebpResult> {
  try {
    const img = await loadImage(file);
    return (await encodeAt(img, maxDimension)) ?? asOriginal(file);
  } catch {
    return asOriginal(file);
  }
}

/** One encoded size, and the width it was capped at. */
export interface SizedResult extends WebpResult {
  width: number;
}

/**
 * Every size an upload needs: the full-size file plus the small ladder from
 * {@link smallVariantsFor}.
 *
 * This is where the image optimizer went. With no hosted resizer in front of
 * storage, a slot downloads byte-for-byte whatever file it points at, so the
 * sizes have to exist before anyone asks for them — one decode here replaces
 * a metered transformation on every future request.
 *
 * `variants` is empty **only** when the browser couldn't re-encode at all
 * (canvas unavailable or tainted). That is the signal callers use to decide
 * the naming: no variants means the full must be stored *untagged*, which
 * upholds the promise `lib/media.ts` makes — a width-tagged URL always has
 * siblings that exist.
 */
export async function toWebpVariants(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<{ full: WebpResult; variants: SizedResult[] }> {
  try {
    // One decode feeds every encode — decoding a 12MP phone photo is by far
    // the expensive half on the hardware this dashboard runs on.
    const img = await loadImage(file);
    const full = await encodeAt(img, maxDimension);
    if (!full) return { full: asOriginal(file), variants: [] };

    const variants: SizedResult[] = [];
    for (const width of smallVariantsFor(maxDimension)) {
      const encoded = await encodeAt(img, width);
      // A mismatched format would break URL derivation (which only swaps the
      // width), and a missing one would break the tag's promise — either way
      // the whole ladder is abandoned rather than half-written.
      if (!encoded || encoded.ext !== full.ext) return { full, variants: [] };
      variants.push({ ...encoded, width });
    }

    return { full, variants };
  } catch {
    return { full: asOriginal(file), variants: [] };
  }
}
