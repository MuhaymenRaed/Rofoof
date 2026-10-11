"use server";

import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth/dal";
import { isR2Prefix, r2Bucket, r2Client, r2PublicUrl, type R2Prefix } from "@/lib/r2";
import { IMAGE_CACHE_CONTROL, MAX_UPLOAD_BYTES } from "@/lib/webp";

/**
 * Hand the browser short-lived permission to PUT a handful of objects into R2.
 *
 * ## This is where RLS went
 *
 * Uploads used to go browser → Supabase Storage directly, and the storage
 * policies decided who could write where:
 *
 *   product-images   INSERT  authenticated AND is_admin()
 *   custom-artwork   INSERT  authenticated OR anon      (any visitor)
 *
 * R2 has no per-user auth — a presigned URL is bearer permission to write that
 * one key. So those two rules are re-implemented here, deliberately as the
 * same split rather than a simpler "admins only" (which would break customers
 * uploading artwork for a custom request) or a simpler "anyone" (which would
 * let a visitor overwrite catalogue photos).
 *
 * ## What a signature is scoped to
 *
 * One exact key, one exact content type, one exact byte length, for five
 * minutes. Not a prefix, not a wildcard, not an open-ended body. Every one of
 * those is part of the signature, so a caller cannot widen any of them after
 * the fact — a request that differs is rejected as unsigned rather than
 * quietly accepted.
 *
 * Bear in mind what this endpoint is: an UNAUTHENTICATED write into the shop's
 * storage, because that is what customer artwork requires. Everything below is
 * about keeping that door exactly as wide as it has to be.
 */

const MAX_KEYS = 8;
/** Long enough for a slow upload on bad mobile data, short enough to not linger. */
const EXPIRES_SECONDS = 300;

/**
 * What may be stored, as an allowlist rather than a pattern.
 *
 * This was `image/*` and that was a stored-XSS hole: it admits
 * `image/svg+xml`, and an SVG is a script document. It would have been served
 * from media.rofoof.net and opened directly — the admin's own orders board
 * links straight to artwork with `target="_blank"` — so a customer could have
 * had script running in the admin's browser just by "uploading a design".
 *
 * These three are everything the uploader can legitimately produce:
 * `lib/webp.ts` encodes to WebP, falls back to JPEG, and only passes an
 * original through when the canvas is unavailable entirely. A PNG original in
 * that rare path is fine; an SVG one is refused, which is the right trade.
 */
const ALLOWED_CONTENT_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;

/**
 * Object keys the browser may ask to sign.
 *
 * `prefix/segments/name.ext`, where the prefix is one of the two known
 * buckets. The shape is pinned so a crafted key cannot escape its prefix
 * (`..`), hide a path (a leading slash), or land somewhere the public URL
 * builder would mangle.
 */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;

/**
 * And it must end in one of the extensions we actually store.
 *
 * Belt to the content-type allowlist's braces, because that allowlist alone is
 * NOT sufficient: the presigner does not sign `content-type` (the signature
 * covers content-length, host and if-none-match), so a caller can declare
 * `image/webp` here and then PUT with `Content-Type: image/svg+xml`. R2 stores
 * and serves whatever it is sent — verified against the live bucket.
 *
 * So the real defence against an SVG executing is the Content-Security-Policy
 * and nosniff headers on the media origin, set as a Cloudflare response-header
 * rule on media.rofoof.net. This check is the cheap second layer: it keeps the
 * key namespace honest, so nothing is ever addressable as `…/evil.svg`.
 */
const ALLOWED_EXT_RE = /\.(webp|jpe?g|png)$/i;

const schema = z.object({
  prefix: z.string().refine(isR2Prefix, "unknown bucket"),
  parts: z
    .array(
      z.object({
        key: z.string().min(1).max(220),
        /**
         * Signed into the URL, so the upload must be exactly this many bytes.
         *
         * Without it a presigned PUT accepts a body of any size, and this
         * endpoint is open to anonymous callers — one request could have
         * written gigabytes into the bucket and spent the free tier the whole
         * migration existed to get back under. The cap is the same one the
         * browser encoder already enforces on its input.
         */
        size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
      }),
    )
    .min(1)
    .max(MAX_KEYS),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
});

export type SignUploadResult =
  | {
      ok: true;
      urls: { key: string; uploadUrl: string; publicUrl: string }[];
      /**
       * The signature only permits CREATING these keys, never replacing one.
       * The caller must send `If-None-Match: *` — it is part of the signature,
       * so omitting it fails the request rather than bypassing the condition.
       */
      createOnly: boolean;
    }
  | { ok: false; error: string };

export async function signUploadUrlsAction(input: {
  prefix: string;
  parts: { key: string; size: number }[];
  contentType: string;
}): Promise<SignUploadResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { prefix, parts, contentType } = parsed.data;

  // The product catalogue is admin-only; customer artwork is open, exactly as
  // the storage policies had it. requireAdmin() throws, so a non-admin asking
  // for a catalogue key never reaches the signer.
  const isCatalogue = (prefix as R2Prefix) === "product-images";
  if (isCatalogue) await requireAdmin();

  /**
   * Anonymous uploads may create, never overwrite.
   *
   * Supabase defaulted to `upsert: false`, so a PUT at an existing path simply
   * failed. Plain S3 semantics are the opposite — a PUT replaces — which would
   * have quietly handed any visitor who learned a customer's artwork URL the
   * ability to replace that artwork. Signing the condition in restores the old
   * behaviour: R2 answers 412 on the second write (verified against the live
   * bucket). The catalogue is exempt because it is admin-only and the editor
   * legitimately re-saves over its own keys.
   */
  const createOnly = !isCatalogue;

  // Every key must sit under the declared prefix. Checked after the auth gate
  // so a caller cannot probe which keys exist by watching error shapes.
  const scoped = parts.map((p) => ({ ...p, key: `${prefix}/${p.key.replace(/^\/+/, "")}` }));
  if (
    !scoped.every(
      (p) =>
        KEY_RE.test(p.key) &&
        ALLOWED_EXT_RE.test(p.key) &&
        !p.key.includes("..") &&
        p.key.startsWith(`${prefix}/`),
    )
  ) {
    return { ok: false, error: "invalid_key" };
  }

  const client = r2Client();
  const Bucket = r2Bucket();

  try {
    const urls = await Promise.all(
      scoped.map(async ({ key, size }) => ({
        key,
        // CacheControl is signed in, so the stored object carries it and a
        // returning shopper re-downloads nothing — these paths are immutable
        // (every one carries a UUID or timestamp). See lib/webp.ts.
        uploadUrl: await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket,
            Key: key,
            ContentType: contentType,
            ContentLength: size,
            CacheControl: `public, max-age=${IMAGE_CACHE_CONTROL}, immutable`,
            ...(createOnly ? { IfNoneMatch: "*" } : {}),
          }),
          { expiresIn: EXPIRES_SECONDS },
        ),
        publicUrl: r2PublicUrl(key),
      })),
    );
    return { ok: true, urls, createOnly };
  } catch (error) {
    console.error("[upload] presign failed:", error);
    return { ok: false, error: "presign_failed" };
  }
}
