/**
 * Upload limits, shared by the browser encoder and the server that signs the
 * uploads.
 *
 * Their own module, with NO `"use client"` or `"use server"` directive,
 * because both sides import them.
 *
 * They used to live in `lib/webp.ts`, which is a client module — and a server
 * action importing a value across that boundary is not an ordinary import.
 * Next.js can replace it with a client reference, so a constant that reads as
 * 20MB in the browser is not guaranteed to still be a number on the server.
 * `z.number().max(undefined)` does not throw; it simply never rejects. A size
 * cap that quietly stops being a cap is worse than no cap, because it looks
 * enforced in review.
 */

/** 20MB per source image — the cap the browser applies before re-encoding. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Uploaded files are immutable — every path carries a UUID or timestamp, so a
 * given URL always returns the same bytes. Caching them for a year means the
 * CDN answers repeat views instead of re-fetching from storage.
 */
export const IMAGE_CACHE_CONTROL = "31536000"; // seconds = 365 days
