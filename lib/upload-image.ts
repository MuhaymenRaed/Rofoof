"use client";

import { variantName } from "@/lib/media";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { IMAGE_CACHE_CONTROL, type SizedResult, type WebpResult } from "@/lib/webp";

/**
 * Write one image to a storage bucket as a width-tagged set.
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
 */
export async function uploadImagePair({
  bucket,
  base,
  image,
  maxDimension,
  upsert = false,
}: {
  /** Storage bucket name. */
  bucket: string;
  /** Object path WITHOUT extension — the variant tag and ext are appended. */
  base: string;
  image: { full: WebpResult; variants: SizedResult[] };
  /** Longest edge the full variant was capped at; becomes its tag. */
  maxDimension: number;
  upsert?: boolean;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const store = createSupabaseBrowserClient().storage.from(bucket);
  const put = (path: string, part: WebpResult) =>
    store.upload(path, part.blob, {
      upsert,
      contentType: part.contentType,
      // Immutable content behind a UUID/timestamp path, so a year is safe and
      // means a returning shopper re-downloads nothing.
      cacheControl: IMAGE_CACHE_CONTROL,
    });

  let tagged = image.variants.length > 0;
  for (const variant of image.variants) {
    const { error } = await put(variantName(base, variant.width, variant.ext), variant);
    if (error) {
      // Half a ladder is worse than none: it would tag the full-size URL and
      // point the loader at a width that was never stored.
      tagged = false;
      break;
    }
  }

  const fullPath = tagged
    ? variantName(base, maxDimension, image.full.ext)
    : `${base}.${image.full.ext}`;

  const { error } = await put(fullPath, image.full);
  if (error) return { ok: false, error: error.message };

  return { ok: true, url: store.getPublicUrl(fullPath).data.publicUrl };
}
