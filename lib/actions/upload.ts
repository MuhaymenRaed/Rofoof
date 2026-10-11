"use server";

import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireAdmin } from "@/lib/auth/dal";
import { isR2Prefix, r2Bucket, r2Client, r2PublicUrl, type R2Prefix } from "@/lib/r2";
import { IMAGE_CACHE_CONTROL } from "@/lib/webp";

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
 * One exact key, for five minutes. Not a prefix, not a wildcard: the caller
 * declares every object it is about to write, and each URL permits that object
 * and nothing else. A leaked URL is good for one overwrite of one path that
 * the holder already knew, until it expires.
 */

const MAX_KEYS = 8;
/** Long enough for a slow upload on bad mobile data, short enough to not linger. */
const EXPIRES_SECONDS = 300;

/**
 * Object keys the browser may ask to sign.
 *
 * `prefix/segments/name.ext`, where the prefix is one of the two known
 * buckets. The shape is pinned so a crafted key cannot escape its prefix
 * (`..`), hide a path (a leading slash), or land somewhere the public URL
 * builder would mangle.
 */
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/;

const schema = z.object({
  prefix: z.string().refine(isR2Prefix, "unknown bucket"),
  keys: z.array(z.string().min(1).max(220)).min(1).max(MAX_KEYS),
  contentType: z.string().trim().regex(/^image\/[a-z0-9.+-]{2,30}$/i),
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
  keys: string[];
  contentType: string;
}): Promise<SignUploadResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { prefix, keys, contentType } = parsed.data;

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
  const full = keys.map((k) => `${prefix}/${k.replace(/^\/+/, "")}`);
  if (!full.every((k) => KEY_RE.test(k) && !k.includes("..") && k.startsWith(`${prefix}/`))) {
    return { ok: false, error: "invalid_key" };
  }

  const client = r2Client();
  const Bucket = r2Bucket();

  try {
    const urls = await Promise.all(
      full.map(async (key) => ({
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
