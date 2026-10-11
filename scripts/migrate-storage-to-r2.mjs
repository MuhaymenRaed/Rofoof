/**
 * Copy every object from Supabase Storage into Cloudflare R2.
 *
 *   node scripts/migrate-storage-to-r2.mjs            # copy (resumable)
 *   node scripts/migrate-storage-to-r2.mjs --verify   # compare only, write nothing
 *   node scripts/migrate-storage-to-r2.mjs --bucket product-images
 *
 * Needs `npm i -D @aws-sdk/client-s3` once.
 *
 * ── Why the key layout matters ───────────────────────────────────────────────
 * An object keeps its Supabase path EXACTLY, with the bucket name as the first
 * segment:
 *
 *   supabase  .../storage/v1/object/public/product-images/mug/171…-w800.webp
 *   r2                                     product-images/mug/171…-w800.webp
 *
 * That makes the database rewrite a single prefix swap, and — far more
 * importantly — it preserves the `-w<n>.webp` sibling convention that
 * `lib/image-loader.ts` relies on. The loader rewrites a URL to a narrower
 * variant WITHOUT checking that the target exists (see lib/media.ts: "the tag
 * is a promise"). Rename or reshuffle one path here and the loader starts
 * pointing live traffic at 404s.
 *
 * ── Resumable on purpose ─────────────────────────────────────────────────────
 * 23k objects over a home connection will be interrupted. Every object is
 * HEADed in R2 first and skipped when it is already there at the same byte
 * length, so re-running costs a cheap metadata call per object and copies only
 * what is genuinely missing. Nothing is ever deleted from Supabase — that is
 * the rollback.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let S3;
try {
  S3 = require("@aws-sdk/client-s3");
} catch {
  console.error("Missing dependency. Run:  npm i -D @aws-sdk/client-s3");
  process.exit(1);
}
const { S3Client, PutObjectCommand, HeadObjectCommand } = S3;

/* ------------------------------- config --------------------------------- */

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = env.R2_ACCOUNT_ID;
const R2_BUCKET = env.R2_BUCKET;
const R2_ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;

const missing = Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  R2_ACCOUNT_ID,
  R2_BUCKET,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("Missing in .env.local:\n  " + missing.join("\n  "));
  console.error(
    "\nR2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY come from Cloudflare →\n" +
      "R2 → Manage API tokens → Create token (Object Read & Write).\n" +
      "R2_BUCKET_ID is NOT a credential and cannot be used to authenticate.",
  );
  process.exit(1);
}

/** One row per public bucket. Keys are prefixed with the bucket name. */
const BUCKETS = ["product-images", "custom-artwork"];
/** Immutable content behind a UUID/timestamp path — matches lib/webp.ts. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONCURRENCY = 12;

const args = process.argv.slice(2);
const VERIFY_ONLY = args.includes("--verify");
const ONLY_BUCKET = args.includes("--bucket") ? args[args.indexOf("--bucket") + 1] : null;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

/* ------------------------------ listing ---------------------------------- */

/**
 * Every object in a bucket, walked depth-first.
 *
 * Supabase's list endpoint is per-prefix and pages at 1000, and it reports a
 * folder as a row with `id: null` — so this recurses rather than assuming a
 * flat namespace. Product images live two levels down (`<product>/print/…`),
 * which a non-recursive list would miss entirely.
 */
async function listAll(bucket) {
  const files = [];
  const stack = [""];
  while (stack.length) {
    const prefix = stack.pop();
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
        method: "POST",
        headers: { ...sbHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const o of rows) {
        const path = prefix ? `${prefix}/${o.name}` : o.name;
        if (o.id === null || o.metadata === null) stack.push(path);
        else files.push({ path, size: o.metadata?.size ?? 0, type: o.metadata?.mimetype });
      }
      if (rows.length < 1000) break;
    }
  }
  return files;
}

/* ------------------------------- copying --------------------------------- */

async function existsInR2(key, size) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    // Same length is enough: these objects are immutable by construction, so a
    // matching size cannot be a different version of the same path.
    return size === 0 || head.ContentLength === size;
  } catch {
    return false;
  }
}

async function copyOne(bucket, file) {
  const key = `${bucket}/${file.path}`;
  if (await existsInR2(key, file.size)) return "skipped";
  if (VERIFY_ONLY) return "missing";

  const src = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(file.path)}`;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`download ${key}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type || res.headers.get("content-type") || "application/octet-stream",
      CacheControl: CACHE_CONTROL,
    }),
  );
  return "copied";
}

/** Run `worker` over `items` with a fixed number of workers in flight. */
async function pool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

/* -------------------------------- main ----------------------------------- */

(async () => {
  const targets = ONLY_BUCKET ? [ONLY_BUCKET] : BUCKETS;
  let grandCopied = 0, grandSkipped = 0, grandMissing = 0;
  const failures = [];

  for (const bucket of targets) {
    process.stdout.write(`\n[${bucket}] listing…`);
    const files = await listAll(bucket);
    const bytes = files.reduce((n, f) => n + f.size, 0);
    console.log(` ${files.length} objects, ${(bytes / 1048576).toFixed(1)} MB`);

    let copied = 0, skipped = 0, missing = 0, done = 0;
    await pool(files, CONCURRENCY, async (file) => {
      try {
        const r = await copyOne(bucket, file);
        if (r === "copied") copied++;
        else if (r === "skipped") skipped++;
        else missing++;
      } catch (e) {
        failures.push({ key: `${bucket}/${file.path}`, error: String(e.message || e) });
      }
      if (++done % 250 === 0 || done === files.length) {
        process.stdout.write(`\r  ${done}/${files.length}  copied ${copied}  present ${skipped}  failed ${failures.length}   `);
      }
    });
    console.log();
    grandCopied += copied; grandSkipped += skipped; grandMissing += missing;
  }

  console.log("\n────────────────────────────────────────");
  if (VERIFY_ONLY) {
    console.log(`already in R2 : ${grandSkipped}`);
    console.log(`MISSING       : ${grandMissing}`);
  } else {
    console.log(`copied        : ${grandCopied}`);
    console.log(`already there : ${grandSkipped}`);
  }
  console.log(`failed        : ${failures.length}`);
  for (const f of failures.slice(0, 20)) console.log(`  ! ${f.key} — ${f.error}`);
  if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`);

  // Non-zero exit so a CI step or a shell `&&` chain cannot mistake a partial
  // copy for a finished one. Re-running picks up exactly what is left.
  if (failures.length || grandMissing) process.exit(1);
  console.log("\nAll objects present in R2.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
