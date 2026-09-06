/**
 * One-off backfill: give every pre-existing storage image the width variants
 * that `lib/image-loader.ts` expects.
 *
 * New uploads have written a `-w400` / `-w800` / `-w<cap>` set since the custom
 * loader landed, but photos uploaded before that are a single untagged file.
 * The loader deliberately passes those through untouched — safe, but it means
 * an untagged photo is still downloaded at full size for a 40px row, which is
 * where the egress bill came from. This walks the buckets and closes that gap.
 *
 * Run it from the project root, with the dev dependencies installed:
 *
 *     node scripts/backfill-image-variants.mjs --dry-run    # report only
 *     node scripts/backfill-image-variants.mjs              # do it
 *     node scripts/backfill-image-variants.mjs --bucket=product-images
 *
 * It needs SUPABASE_SERVICE_ROLE_KEY (read from .env.local), because listing a
 * bucket and updating product rows are both privileged.
 *
 * ## What it does, per image
 *
 *   1. downloads the original once (this is the only egress it spends);
 *   2. re-encodes it with sharp into the same ladder the browser produces;
 *   3. uploads the variants, then the tagged full-size file;
 *   4. repoints the database row at the tagged URL.
 *
 * Step 4 is what actually switches a product over, and it happens LAST — until
 * a row is updated its URL is untagged, the loader leaves it alone, and the
 * page behaves exactly as it does today. There is no window where a row points
 * at files that do not exist yet.
 *
 * Originals are never deleted. They cost storage (which is not the quota that
 * broke) and they are what old order records still reference, so removing them
 * would rewrite history to save pennies. Re-running the script is safe: images
 * that already carry a tag are skipped.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/** Mirrors VARIANT_WIDTHS in lib/media.ts — keep the two in step. */
const VARIANT_WIDTHS = [400, 800];
/** Mirrors WEBP_QUALITY in lib/webp.ts (0.78 there is 78 here). */
const WEBP_QUALITY = 78;
const CACHE_CONTROL = "31536000";

/**
 * Per bucket: the longest edge the full-size file is capped at, and which
 * database columns hold its URLs.
 *
 * `custom-artwork` keeps its 4096px cap because the admin prints from that
 * exact file. Its rows are order history, so they are only repointed when
 * `--include-orders` is passed — a customer's finished order is a record, and
 * rewriting one to save a few KB on an admin-only screen is a bad trade by
 * default.
 */
const BUCKETS = {
  "product-images": {
    maxDimension: 1600,
    columns: [
      { table: "products", column: "image_url", array: false },
      { table: "products", column: "images", array: true },
      { table: "product_items", column: "image_url", array: false },
    ],
  },
  "custom-artwork": {
    maxDimension: 4096,
    ordersOnly: true,
    // The admin PRINTS from the full-size file here, so it is copied across
    // byte-for-byte rather than re-encoded — a WebP round-trip at quality 78
    // would quietly degrade the thing the shop actually sells. Only the small
    // display variants are re-encoded, and they keep the original's format so
    // the loader's width swap still resolves.
    preserveOriginal: true,
    columns: [
      { table: "order_items", column: "custom_image_url", array: false },
      { table: "order_items", column: "custom_images", array: true },
      { table: "orders", column: "custom_images", array: true },
    ],
  },
};

/** Already-tagged objects are done; anything else is a candidate. */
const TAGGED_RE = /-w\d+\.(webp|jpg|png)$/i;
const IMAGE_RE = /\.(webp|jpe?g|png|avif|gif)$/i;

/**
 * Formats the loader's tag can name, mapped to what sharp and Storage need.
 *
 * `.jpeg` normalises to `jpg` because the tag regex in lib/media.ts only
 * spells it one way; the bytes are untouched either way.
 */
const FORMATS = {
  webp: { ext: "webp", mime: "image/webp", encode: (p) => p.webp({ quality: WEBP_QUALITY }) },
  jpg: { ext: "jpg", mime: "image/jpeg", encode: (p) => p.jpeg({ quality: WEBP_QUALITY }) },
  jpeg: { ext: "jpg", mime: "image/jpeg", encode: (p) => p.jpeg({ quality: WEBP_QUALITY }) },
  png: { ext: "png", mime: "image/png", encode: (p) => p.png({ compressionLevel: 9 }) },
};

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const INCLUDE_ORDERS = args.includes("--include-orders");
const ONLY_BUCKET = args.find((a) => a.startsWith("--bucket="))?.split("=")[1];

function loadEnv() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    // Fall through to the real environment — CI or an exported shell is fine.
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

loadEnv();
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}

const supabase = createClient(URL_BASE, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Every object in a bucket, walking into folders.
 *
 * `list()` returns one page at a time and marks folders by having no `id`, so
 * both have to be handled explicitly — product-images nests one directory per
 * product.
 */
async function listAll(bucket, prefix = "") {
  const out = [];
  const PAGE = 100;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null || entry.id === undefined) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (data.length < PAGE) break;
  }
  return out;
}

const publicUrl = (bucket, path) =>
  supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

/**
 * Build and upload the ladder for one object.
 *
 * Variants go up before the tagged full-size file, for the same reason the
 * browser uploader does it that way: the full URL is what the database will
 * point at, so its siblings must already exist when it becomes reachable.
 */
async function migrate(bucket, path, { maxDimension, preserveOriginal }) {
  const base = path.replace(/\.[^./]+$/, "");
  const sourceExt = (path.split(".").pop() || "").toLowerCase();

  // Display-only buckets are normalised to WebP (the same thing the browser
  // uploader does). Print buckets keep whatever format the master is in, so
  // the copy below stays byte-identical and the variants still share its
  // extension — which is all the loader's width swap needs.
  const format = preserveOriginal ? FORMATS[sourceExt] : FORMATS.webp;
  if (!format) return { skipped: `unsupported format .${sourceExt}` };

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(`download ${path}: ${error.message}`);
  const original = Buffer.from(await data.arrayBuffer());

  const encode = (width) =>
    format
      .encode(
        sharp(original)
          .rotate() // honour EXIF orientation before it is stripped
          .resize({ width, height: width, fit: "inside", withoutEnlargement: true }),
      )
      .toBuffer();

  const put = (objectPath, body) =>
    supabase.storage.from(bucket).upload(objectPath, body, {
      contentType: format.mime,
      cacheControl: CACHE_CONTROL,
      upsert: true,
    });

  for (const width of VARIANT_WIDTHS.filter((w) => w < maxDimension)) {
    const variantPath = `${base}-w${width}.${format.ext}`;
    const { error: upErr } = await put(variantPath, await encode(width));
    if (upErr) throw new Error(`upload ${variantPath}: ${upErr.message}`);
  }

  const fullPath = `${base}-w${maxDimension}.${format.ext}`;
  // Byte-for-byte for a print master; re-encoded (and capped) otherwise.
  const fullBody = preserveOriginal ? original : await encode(maxDimension);
  const { error: fullErr } = await put(fullPath, fullBody);
  if (fullErr) throw new Error(`upload ${fullPath}: ${fullErr.message}`);

  return { from: publicUrl(bucket, path), to: publicUrl(bucket, fullPath) };
}

/**
 * Repoint database rows from the old URL to the tagged one.
 *
 * Scalar columns are a plain equality update. Array columns are read back and
 * rewritten element-wise, because Postgres array replacement can't be
 * expressed through PostgREST — and doing it in JS keeps the ordering of a
 * product's gallery intact, which decides which photo is the cover.
 */
async function repoint(columns, map) {
  let updated = 0;

  for (const { table, column, array } of columns) {
    if (!array) {
      for (const [from, to] of map) {
        const { error, count } = await supabase
          .from(table)
          .update({ [column]: to }, { count: "exact" })
          .eq(column, from);
        // A column the schema doesn't have yet is not a failure — this project
        // applies DDL by hand, so code and schema legitimately disagree.
        if (error) {
          if (isMissingColumn(error)) break;
          throw new Error(`update ${table}.${column}: ${error.message}`);
        }
        updated += count ?? 0;
      }
      continue;
    }

    const { data, error } = await supabase.from(table).select(`id, ${column}`);
    if (error) {
      if (isMissingColumn(error)) continue;
      throw new Error(`select ${table}.${column}: ${error.message}`);
    }

    for (const row of data ?? []) {
      const current = row[column];
      if (!Array.isArray(current) || current.length === 0) continue;
      const next = current.map((url) => map.get(url) ?? url);
      if (next.every((url, i) => url === current[i])) continue;

      const { error: upErr } = await supabase
        .from(table)
        .update({ [column]: next })
        .eq("id", row.id);
      if (upErr) throw new Error(`update ${table}.${column} #${row.id}: ${upErr.message}`);
      updated++;
    }
  }

  return updated;
}

const isMissingColumn = (error) =>
  error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written.\n" : "Backfilling image variants.\n");

  for (const [bucket, config] of Object.entries(BUCKETS)) {
    if (ONLY_BUCKET && ONLY_BUCKET !== bucket) continue;
    if (config.ordersOnly && !INCLUDE_ORDERS) {
      console.log(`${bucket}: skipped (pass --include-orders to migrate order artwork)\n`);
      continue;
    }

    console.log(`${bucket}:`);
    const paths = await listAll(bucket);
    const todo = paths.filter((p) => IMAGE_RE.test(p) && !TAGGED_RE.test(p));
    console.log(`  ${paths.length} objects, ${todo.length} still untagged`);

    if (todo.length === 0 || DRY) {
      for (const p of todo.slice(0, 10)) console.log(`    would migrate ${p}`);
      if (todo.length > 10) console.log(`    … and ${todo.length - 10} more`);
      console.log("");
      continue;
    }

    const map = new Map();
    let failed = 0;
    let skipped = 0;
    for (const [i, path] of todo.entries()) {
      try {
        const result = await migrate(bucket, path, config);
        if (result.skipped) {
          skipped++;
          console.log(`\n  -- ${path}: ${result.skipped}`);
        } else {
          map.set(result.from, result.to);
        }
        process.stdout.write(`\r  encoded ${i + 1}/${todo.length}`);
      } catch (err) {
        failed++;
        console.error(`\n  !! ${path}: ${err.message}`);
      }
    }
    console.log(`\n  ${map.size} migrated, ${skipped} skipped, ${failed} failed`);

    const updated = await repoint(config.columns, map);
    console.log(`  ${updated} database rows repointed\n`);
  }

  console.log(
    DRY
      ? "Dry run complete."
      : "Done. Originals were left in place; re-running skips anything already tagged.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
