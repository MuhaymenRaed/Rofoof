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
- The service worker (`public/sw.js`) caches storage images and **nothing
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
