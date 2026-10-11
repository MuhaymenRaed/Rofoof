/**
 * Width-tagged storage variants — this app's replacement for a hosted image
 * optimizer.
 *
 * Vercel's optimizer is metered and this shop ran it out, at which point every
 * `/_next/image` request answers 402 and the whole catalogue turns into broken
 * thumbnails. Paid transformation services (Supabase's included, which is not
 * on the free plan) just move the meter somewhere else, and a third-party
 * resizing proxy would put another hop in front of photos for shoppers on
 * unstable Iraqi mobile data — the one thing `AGENTS.md` is most careful about.
 *
 * So the resizing happens **once, at upload time, in the admin's own browser**,
 * and the results are stored as siblings named after the width they were capped
 * at:
 *
 *     mug/1717…-w400.webp    ← cards, cart lines, list rows
 *     mug/1717…-w800.webp    ← quick view, hi-DPI cards
 *     mug/1717…-w1600.webp   ← the URL stored in the database; lightbox
 *
 * `lib/image-loader.ts` maps a width `next/image` asks for onto one of these,
 * so the browser's own `srcset`/`sizes` machinery picks the smallest adequate
 * file. Cost per resize: zero, forever, on any host.
 *
 * ## The tag is a promise
 *
 * A `-w<n>` suffix means **every smaller width in {@link VARIANT_WIDTHS} was
 * written too** — `uploadImagePair()` only tags the full-size object once its
 * siblings are safely stored. That is what lets the loader rewrite a URL
 * without ever checking whether the target exists.
 *
 * Untagged URLs (everything uploaded before this convention, plus bundled
 * assets and blob: previews) are passed through untouched, so a deploy that
 * lands before the backfill has run behaves exactly like today rather than
 * 404ing the catalogue. `scripts/backfill-image-variants.mjs` is what moves
 * old rows across.
 */

/**
 * The small variants written beside every full-size upload, ascending.
 *
 * Chosen from what the app actually renders: 400 covers every list row, cart
 * line and card up to 2× density; 800 covers a card at 3× and the quick-view
 * panel; anything larger is the lightbox, which gets the full file. A third
 * step between them would add upload time for a size nothing asks for.
 */
export const VARIANT_WIDTHS = [400, 800] as const;

/**
 * Matches the trailing `-w<width>.<ext>` tag.
 *
 * The extension list is closed on purpose, so a customer-supplied filename
 * that merely looks tagged can't steer the loader at a made-up URL. `webp` and
 * `jpg` are what the browser uploader produces; `png` only ever appears on
 * files the backfill tagged, where the full-size object is a byte-for-byte
 * copy of a print master and must keep its original format.
 */
const VARIANT_RE = /-w(\d+)\.(webp|jpg|png)$/i;

/** Build the object name for one variant: `<base>-w<width>.<ext>`. */
export function variantName(base: string, width: number, ext: string): string {
  return `${base}-w${width}.${ext}`;
}

/**
 * Which small widths belong beside a full-size file capped at `maxDimension`.
 *
 * Both the uploader and the loader read this, so they cannot disagree about
 * what exists — the uploader writes exactly this list, and the loader chooses
 * only from it.
 */
export function smallVariantsFor(maxDimension: number): number[] {
  return VARIANT_WIDTHS.filter((w) => w < maxDimension);
}

interface ParsedVariant {
  base: string;
  /** the width this URL's full-size file was capped at */
  full: number;
  ext: string;
  query: string;
}

/** Split a width-tagged URL, or null when it isn't one. */
function parse(url: string): ParsedVariant | null {
  const cut = url.indexOf("?");
  const path = cut === -1 ? url : url.slice(0, cut);
  const query = cut === -1 ? "" : url.slice(cut);

  const match = VARIANT_RE.exec(path);
  if (!match) return null;
  return {
    base: path.slice(0, match.index),
    full: Number(match[1]),
    ext: match[2],
    query,
  };
}

/**
 * Where media used to be served from, before the move to R2 on 2026-10-11.
 *
 * Any Supabase project ref, because the host is not what identifies these —
 * the `/storage/v1/object/public/` path is, and the bucket name that follows it
 * became the first segment of the R2 key, byte for byte.
 */
const LEGACY_STORAGE_RE =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i;

/** Where it is served from now. Also in next.config.ts and public/sw.js. */
const MEDIA_BASE = "https://media.rofoof.net";

/**
 * Drag a storage URL onto the host that still has the bytes.
 *
 * `docs/media-urls-to-r2.sql` repointed every row in the database, but it could
 * not reach the one place that also holds storage URLs: **the shopper's cart**,
 * which lives in their browser's localStorage. A basket filled before the move
 * — with custom artwork uploaded to Supabase — is still sitting open on some
 * phone right now, and the files it names were deleted when the old bucket was
 * emptied. Submitted as-is it would be refused by place_order(), or worse,
 * recorded as an order whose artwork 404s for the admin who has to print it.
 *
 * Call this on anything arriving from the client that will be stored. Anything
 * already on the current host, relative, or `blob:` passes through untouched.
 */
export function toCurrentMediaUrl(url: string): string {
  return url.replace(LEGACY_STORAGE_RE, `${MEDIA_BASE}/`);
}

/**
 * The stored file best matching a requested render width.
 *
 * Returns `url` unchanged for anything untagged — that is the safe default and
 * covers legacy rows, `/logo.png` and blob: previews alike.
 *
 * Any query string is preserved, so this composes with the retry hook's
 * cache-buster instead of being defeated by it.
 */
export function variantUrlFor(url: string, width: number): string {
  const parsed = parse(url);
  if (!parsed) return url;

  const pick = smallVariantsFor(parsed.full).find((w) => w >= width);
  // Nothing small enough covers it — the full-size file is already the answer.
  if (pick === undefined) return url;

  return variantName(parsed.base, pick, parsed.ext) + parsed.query;
}
