import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 — where this shop's media lives.
 *
 * Supabase Storage's free tier is 1 GB and the shop went past it (1.5 GB across
 * 23k objects), so the bytes moved to R2's 10 GB free tier. Supabase still
 * holds the database; only the files moved.
 *
 * ## Keys keep the old bucket name as their first segment
 *
 *   supabase  …/storage/v1/object/public/product-images/mug/171…-w800.webp
 *   r2                                   product-images/mug/171…-w800.webp
 *
 * That made the database migration a single prefix swap, and — far more
 * importantly — it preserves the `-w<n>.webp` sibling convention in
 * `lib/media.ts`. The image loader rewrites a URL to a narrower variant
 * WITHOUT checking the target exists ("the tag is a promise"), so reshaping
 * paths here would point live traffic at 404s.
 *
 * ## Why uploads need a server round trip now
 *
 * Supabase uploads went straight from the browser, with RLS deciding who could
 * write what. R2 has no per-user auth and its secret can never reach the
 * browser, so the browser asks THIS server for a short-lived presigned PUT and
 * uploads to that. `lib/actions/upload.ts` is where the permission check that
 * RLS used to do now lives.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** The two logical buckets, kept as key prefixes inside one R2 bucket. */
export const R2_PREFIXES = ["product-images", "custom-artwork"] as const;
export type R2Prefix = (typeof R2_PREFIXES)[number];

export function isR2Prefix(value: string): value is R2Prefix {
  return (R2_PREFIXES as readonly string[]).includes(value);
}

/** Public base for every stored object, e.g. https://media.rofoof.net */
export function r2PublicBase(): string {
  return required("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
}

/** The public URL an object key is served at. */
export function r2PublicUrl(key: string): string {
  return `${r2PublicBase()}/${key.replace(/^\/+/, "")}`;
}

let client: S3Client | null = null;

/**
 * Lazily built so a missing credential surfaces when an upload is attempted,
 * not when any module that merely imports this file is first loaded — which
 * would take the whole storefront down over a feature only admins touch.
 */
export function r2Client(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export function r2Bucket(): string {
  return required("R2_BUCKET");
}
