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

Vercel's image optimizer is **off** (`images.unoptimized` in `next.config.ts`) —
it is metered, and once the quota runs out every `/_next/image` request answers
402 and the whole catalogue turns into broken thumbnails. Photos are served
straight from Supabase Storage instead, which means **nothing sits in front of
them**: no proxy to absorb a dropped request, and `next/image` never retries one
it lost.

So, for any remote Storage URL:

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

# Database changes

Table rows can be read and written directly through the service-role client.
DDL cannot — `CREATE OR REPLACE FUNCTION`, `ALTER TABLE` and friends have to be
run by hand in the Supabase SQL editor, so schema and code land at different
times and in either order.

Write the frontend so it survives arriving first: send new RPC arguments
conditionally, and fall back to the old column set when a `select` for new
columns errors. A deploy must never depend on a migration that may not be
applied yet.
