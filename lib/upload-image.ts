"use client";

import { variantName } from "@/lib/media";
import { signUploadUrlsAction } from "@/lib/actions/upload";
import { IMAGE_CACHE_CONTROL, type SizedResult, type WebpResult } from "@/lib/webp";

/**
 * Write one image to storage as a width-tagged set.
 *
 * All three upload paths in the app funnel through here so the naming promise
 * can't drift: **if the returned URL is width-tagged, every smaller variant
 * was written too** (see `lib/media.ts`). The image loader rewrites URLs on
 * that promise alone, without checking whether the target exists — get it
 * wrong in one place and those slots 404 instead of merely being heavy.
 *
 * Order matters. The small variants go up FIRST: the full-size URL is what
 * gets handed back and stored in the database, so by the time anything can
 * reference it, the siblings it implies are already there. Uploading the other
 * way round leaves a window where a saved product points at files that don't
 * exist yet.
 *
 * A variant that fails to upload is not fatal — the full is then stored
 * *untagged*, which reads exactly like a legacy row: heavier, never broken.
 *
 * ## Storage is R2 now, not Supabase
 *
 * The signature is unchanged and `bucket` still names the old Supabase bucket,
 * because that name is the first segment of the R2 key — the migration kept
 * every path byte-for-byte so the variant ladder kept working. See `lib/r2.ts`.
 *
 * What changed is that the browser can no longer write directly: R2 has no
 * per-user auth and its secret must never reach the client. So this asks the
 * server to sign the exact keys it is about to write (one round trip for the
 * whole ladder) and PUTs to those URLs. The permission check that Supabase RLS
 * used to do lives in `lib/actions/upload.ts`.
 */
export async function uploadImagePair({
  bucket,
  base,
  image,
  maxDimension,
}: {
  /** Logical bucket — becomes the first segment of the R2 key. */
  bucket: string;
  /** Object path WITHOUT extension — the variant tag and ext are appended. */
  base: string;
  image: { full: WebpResult; variants: SizedResult[] };
  /** Longest edge the full variant was capped at; becomes its tag. */
  maxDimension: number;
  /**
   * Accepted and ignored. Every path here carries a UUID or timestamp, so a
   * PUT is always to a fresh key and S3 semantics overwrite anyway — there is
   * no "don't clobber" mode to opt out of. Kept so the call sites did not all
   * have to change in the same commit as the storage move.
   */
  upsert?: boolean;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ext = image.full.ext;

  // Both candidates for the full-size name are signed up front, because which
  // one is used depends on whether the variants land — and asking the server
  // again afterwards would be a second round trip on a connection that may
  // already be struggling.
  const taggedFull = variantName(base, maxDimension, ext);
  const untaggedFull = `${base}.${ext}`;
  const variantKeys = image.variants.map((v) => variantName(base, v.width, v.ext));

  const signed = await signUploadUrlsAction({
    prefix: bucket,
    keys: [...variantKeys, taggedFull, untaggedFull],
    contentType: image.full.contentType,
  });
  if (!signed.ok) return { ok: false, error: signed.error };

  const urlFor = new Map(signed.urls.map((u) => [u.key, u]));
  const put = async (key: string, part: WebpResult): Promise<boolean> => {
    const target = urlFor.get(`${bucket}/${key}`);
    if (!target) return false;
    try {
      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        body: part.blob,
        headers: {
          "Content-Type": part.contentType,
          "Cache-Control": `public, max-age=${IMAGE_CACHE_CONTROL}, immutable`,
          // Part of the signature when the server signed a create-only write,
          // so this is not optional — without it the request is rejected as
          // unsigned rather than silently overwriting. See lib/actions/upload.ts.
          ...(signed.createOnly ? { "If-None-Match": "*" } : {}),
        },
      });
      return res.ok;
    } catch {
      // A dropped request is the normal failure here, not an exception worth
      // surfacing — the caller only needs to know the object isn't there.
      return false;
    }
  };

  let tagged = image.variants.length > 0;
  for (const variant of image.variants) {
    const ok = await put(variantName(base, variant.width, variant.ext), variant);
    if (!ok) {
      // Half a ladder is worse than none: it would tag the full-size URL and
      // point the loader at a width that was never stored.
      tagged = false;
      break;
    }
  }

  const fullKey = tagged ? taggedFull : untaggedFull;
  if (!(await put(fullKey, image.full))) return { ok: false, error: "upload_failed" };

  return { ok: true, url: urlFor.get(`${bucket}/${fullKey}`)!.publicUrl };
}
