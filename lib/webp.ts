"use client";

/**
 * Client-side WebP conversion for user-submitted artwork. Images are
 * re-encoded (and gently downscaled) in the browser BEFORE upload, so the
 * storage bucket only ever holds compact WebP files instead of 10MB camera
 * originals — typically a 3–10× space saving with no server work.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB per source image
/**
 * Longest edge for artwork a customer sends us to PRODUCE — kept at print
 * resolution because the admin prints from this exact file.
 */
const MAX_DIMENSION = 4096;
/**
 * Longest edge for catalogue photos, which are only ever *displayed* (largest
 * on-screen use is a full-width lightbox). Since images are served straight
 * from storage without a resizing step, keeping the source near display size
 * is what stops a 4K original being downloaded for a 64px thumbnail.
 */
export const DISPLAY_MAX_DIMENSION = 1600;
const WEBP_QUALITY = 0.85;

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
 * Convert an image file to WebP. Falls back to the original file when the
 * browser can't encode WebP (ancient Safari) or decoding fails — uploading
 * something beats losing the customer's artwork.
 */
export async function toWebp(
  file: File,
  maxDimension: number = MAX_DIMENSION,
): Promise<WebpResult> {
  const fallback: WebpResult = {
    blob: file,
    ext: (file.name.split(".").pop() || "jpg").toLowerCase(),
    contentType: file.type || "image/jpeg",
  };

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY),
    );
    if (!blob || blob.type !== "image/webp") return fallback;

    return { blob, ext: "webp", contentType: "image/webp" };
  } catch {
    return fallback;
  }
}
