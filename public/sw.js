/*
 * Service worker — installability, plus a cache for storage images.
 *
 * It still caches NOTHING of the storefront itself. The shop is server-rendered
 * with ISR/revalidation, and a cached page or API response would mean serving
 * customers stale prices and stock — so HTML, RSC payloads, auth and every
 * Supabase REST call pass straight through to the network, exactly as before.
 *
 * The one exception is uploaded images, and only because they are the thing
 * that can't go stale: every object path carries a UUID or a timestamp, so a
 * given URL returns the same bytes forever. Editing a product writes a NEW path
 * and the old entry is simply never asked for again.
 *
 * Why it's worth the exception: with Vercel's image optimizer switched off
 * (see next.config.ts), photos come straight from Supabase Storage, and each
 * one is billed as egress every time a browser actually fetches it. A one-year
 * `Cache-Control` covers a shopper whose HTTP cache survives — but on the
 * cheap Android phones this shop runs on, that cache is small and gets evicted
 * constantly, so returning customers were re-downloading the whole catalogue
 * over and over. Cache Storage is not evicted under the same pressure, which
 * turns a repeat visit into zero bytes instead of a fresh bill.
 *
 * It doubles as offline support: a photo already seen still renders with no
 * connection at all.
 */

const IMAGE_CACHE = "rofoof-storage-images-v1";

/** Public Storage objects only — never the REST, auth or realtime endpoints. */
const STORAGE_PATH = "/storage/v1/object/public/";

/**
 * Roughly a full catalogue of thumbnails plus the photos of anything actually
 * opened. Entries are small (the thumb variant is a few KB), and the trim below
 * keeps the total bounded so this can't grow without limit on a phone.
 */
const MAX_ENTRIES = 400;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      // Drop caches from an older version of this file.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("rofoof-storage-images-") && n !== IMAGE_CACHE)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  ),
);

/**
 * Oldest-first trim. `cache.keys()` returns insertion order, so slicing the
 * front is a usable approximation of LRU without tracking access times.
 */
async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  // Everything that isn't a public storage object keeps its old behaviour:
  // untouched, straight to the network.
  if (!url.pathname.includes(STORAGE_PATH)) return;

  // Key without the query string. The retry hook appends `?retry=N` to defeat
  // negative caching, and keying on the full URL would make every one of those
  // a guaranteed miss — re-downloading a photo we already hold.
  const key = url.origin + url.pathname;

  event.respondWith(
    (async () => {
      const cache = await caches.open(IMAGE_CACHE);
      const hit = await cache.match(key);
      if (hit) return hit;

      const response = await fetch(request);
      // Only store a real, complete success. A 404, a 402 or an opaque
      // cross-origin error cached here would be sticky in a way the retry
      // ladder could never recover from.
      if (response.ok && response.type !== "opaque") {
        await cache.put(key, response.clone());
        // Deliberately not awaited: trimming must not delay the picture.
        trim(cache);
      }
      return response;
    })(),
  );
});
