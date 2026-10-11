<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Who this is for

Shoppers in Iraq, on phones, mostly on unstable mobile data. Arabic first —
the layout is RTL and uses logical properties (`start`/`end`, never
`left`/`right`). Every user-facing string needs both `ar` and `en` in
`lib/i18n.ts` — keys are typed, so a missing one is a compile error rather than
a silent fallback.

Assume any request can drop halfway. Prefer something that recovers by itself
over something that needs the customer to understand what went wrong.

# Images

Vercel's image optimizer is **off** — it is metered, this shop ran the
allowance out, and once it goes every `/_next/image` request answers 402 and
the whole catalogue turns into broken thumbnails. We do not pay for a
replacement and we do not proxy through a third party (another hop in front of
photos is the last thing these shoppers need).

Instead, `next.config.ts` sets `loader: "custom"` and points at
`lib/image-loader.ts`. **Resizing happens once, in the admin's browser, at
upload time.** `lib/webp.ts` writes a ladder of width-tagged siblings —
`…-w400.webp`, `…-w800.webp`, `…-w1600.webp` — and the loader just picks one.
No request touches a metered service, on any host.

Two rules follow, and getting either wrong is what ran the *storage* egress
quota out:

- **Every remote image needs a `sizes`.** The loader turns `sizes` into a real
  `srcset` over that ladder; without one the browser assumes `100vw` and
  fetches the largest file for a 40px avatar.
- **Never write a storage URL by hand.** Upload through `uploadImagePair()`
  (`lib/upload-image.ts`), which writes the whole ladder and only tags the
  full-size object once its siblings are stored. A `-w<n>` tag is a promise the
  loader trusts without checking. Untagged URLs (legacy rows, `/logo.png`,
  blob: previews) pass through untouched, so a deploy can safely land before
  `scripts/backfill-image-variants.mjs` has run.

**Media is on Cloudflare R2, not Supabase Storage.** Supabase's 1 GB free tier
ran out at 1.5 GB across 23k objects, so the files moved to R2 (10 GB free) and
are served from `https://media.rofoof.net`. The database did NOT move. Keys kept
their Supabase paths byte-for-byte, with the old bucket name as the first
segment (`product-images/…`, `custom-artwork/…`), precisely so the `-w<n>`
ladder above kept working — see `lib/r2.ts`.

One consequence worth knowing before touching uploads: **the browser can no
longer write to storage directly.** Supabase had RLS deciding who could write
what; R2 has no per-user auth and its secret must never reach the client. So
`uploadImagePair()` asks the server to sign the exact keys it is about to write
and PUTs to those URLs. The permission split RLS used to enforce —
`product-images` admin-only, `custom-artwork` open to any visitor — now lives in
`lib/actions/upload.ts`. Keep it there and keep it that shape.

**An uploaded SVG would be stored XSS, and two things stop it.** Customer
artwork upload is deliberately unauthenticated, these URLs are opened directly
(the orders board links to artwork with `target="_blank"`), and an SVG is a
script document.

1. **`content-type` is signed into the presigned URL**
   (`signableHeaders` in `lib/actions/upload.ts`). By default the presigner
   signs only `content-length;host;if-none-match`, which would leave the
   content-type allowlist advisory — declare `image/webp`, PUT
   `image/svg+xml`, and R2 stores and serves an executable document. Both the
   hole and the fix were verified against the live bucket. Do not drop that
   option thinking the allowlist alone is doing the work.
2. **A Cloudflare response-header rule on `media.rofoof.net`** sets
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
   sandbox` and `X-Content-Type-Options: nosniff` on every response from that
   host. It lives in the `http_response_headers_transform` phase of the
   `rofoof.net` zone. This is the layer that also covers the 23k objects
   migrated from Supabase, which were uploaded under the old rules.

Keys must also end `.webp`/`.jpg`/`.png`, so nothing is addressable as an SVG
in the first place.

Nothing else sits in front of Storage: no proxy to absorb a dropped request,
and `next/image` never retries one it lost. So, for any remote Storage URL:

- Use `RetryImage` (`components/ui/retry-image.tsx`), or `ProductMedia` for
  product photos. Never bare `next/image`. Both retry five times on a widening
  ladder, reload themselves the moment the browser reports the connection back,
  and fall back to `OfflineNotice`.
- `OfflineNotice` names the connection as the cause rather than showing a
  broken-image glyph. It is deliberately **non-interactive** — it renders inside
  product cards, gallery thumbnails and order links, where a button would nest
  inside a button or an anchor. It sizes off its own container via `@container`,
  so no caller passes a size.
- Bare `next/image` is still correct for bundled assets (`/logo.png`) and
  in-browser blob previews — no network, nothing to retry.
- Uploads are re-encoded to WebP and capped client-side before they reach
  Storage (`lib/webp.ts`). Keep new upload paths going through it.
- The service worker (`public/sw.js`) caches media images and **nothing
  else** — HTML, RSC payloads and every Supabase REST call still go to the
  network, so prices and stock can't go stale. Image objects are immutable
  (every path carries a UUID or timestamp), which is the only reason that
  exception is safe.

# Database changes

Table rows can be read and written directly through the service-role client.
DDL cannot — `CREATE OR REPLACE FUNCTION`, `ALTER TABLE` and friends have to be
run by hand in the Supabase SQL editor, so schema and code land at different
times and in either order.

Write the frontend so it survives arriving first: send new RPC arguments
conditionally, and fall back to the old column set when a `select` for new
columns errors. A deploy must never depend on a migration that may not be
applied yet.
