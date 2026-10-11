-- ============================================================================
--  LET THE STOREFRONT RECORD VISITS
--  Run this by hand in the Supabase SQL editor (DDL cannot go through the app).
-- ============================================================================
--
--  WHAT WAS ALREADY THERE
--  `public.page_views` exists — id, page_path, visitor_id, created_at — and has
--  existed for a while. It was also completely empty, and nothing in the app
--  had ever referenced it. It had been created and then forgotten.
--
--  It was empty for a reason: RLS is on and there is no insert policy, so every
--  write from the storefront came back
--
--      42501  new row violates row-level security policy for table "page_views"
--
--  which is exactly what you want from a table nothing was writing to, and
--  exactly what has to change now that something is.
--
--  WHAT THIS DOES
--  Adds ONE policy: anonymous and signed-in visitors may INSERT. Nothing else.
--
--  DELIBERATELY NO SELECT POLICY
--  The dashboard reads these counts with the service-role client, which goes
--  around RLS entirely (see getAudienceStats in lib/data/dashboard.ts). So the
--  table stays WRITE-ONLY to the public: a shopper can add their own visit and
--  cannot read anybody's. Granting select to `anon` to save a service-role call
--  would publish the shop's traffic to every visitor.
--
--  WHAT THIS DOES *NOT* DEFEND AGAINST
--  An open insert policy cannot rate-limit. A determined caller can still POST
--  many rows and inflate the visit figures — the column check bounds what each
--  row can COST (no unbounded text), not how many arrive. These numbers are
--  shop analytics, not billing or stock, so that trade is deliberate. If the
--  counts ever start looking wrong, the fix is a Cloudflare rate-limit rule on
--  the REST path, not a policy change here.
--
--  WHAT IS RECORDED
--  One row per page per browser tab — not per navigation. `visitor_id` is the
--  anonymous device marker the coupon limiter already uses: a random uuid in a
--  cookie. There is no name, no account, no address and no IP in this table,
--  and counting distinct visitor_ids counts BROWSERS, never people. A visitor
--  who clears their cookies becomes a new row tomorrow, which is the correct
--  and intended trade.
--
--  SAFE TO DEPLOY IN EITHER ORDER
--  Until this runs, the insert is refused, the tracker swallows the failure,
--  and the dashboard's visit figures are legitimately 0 — the client figures
--  beside them still work, because those come from `profiles`. Nothing breaks
--  and nothing is lost except the visits from before you ran it.
-- ============================================================================

begin;

-- Belt and braces: the table is expected to exist already, but creating it here
-- means this file also works on a fresh database, and `if not exists` makes it a
-- no-op on yours.
create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  page_path text not null,
  visitor_id uuid not null,
  created_at timestamptz not null default now()
);

-- The insert policy below is open to anonymous callers, so the COLUMN has to
-- do the validating — the client's `pathname.slice(0, 200)` is a courtesy, not
-- a control, and anyone can POST here directly. Without this an unbounded text
-- field is free blob storage in the shop's database.
--
-- Deliberately a shape check and not an allowlist of routes: the route table
-- changes, and a visit to a page we forgot to list should be counted, not
-- rejected.
alter table public.page_views
  drop constraint if exists page_views_path_shape;
alter table public.page_views
  add constraint page_views_path_shape
  check (page_path like '/%' and length(page_path) between 1 and 200);

alter table public.page_views enable row level security;

-- The dashboard always filters by period, so this is the index every read uses.
create index if not exists page_views_created_at_idx
  on public.page_views (created_at desc);

drop policy if exists page_views_insert on public.page_views;
create policy page_views_insert
  on public.page_views
  for insert
  to anon, authenticated
  with check (true);

grant insert on public.page_views to anon, authenticated;
grant all    on public.page_views to service_role;

commit;

-- ============================================================================
--  VERIFY
-- ============================================================================
--  1. Open the storefront (NOT the dashboard — it is excluded on purpose), then:
--
--       select page_path, count(*) as views, count(distinct visitor_id) as visitors
--         from public.page_views
--        where created_at >= now() - interval '1 hour'
--        group by page_path
--        order by views desc;
--
--  2. The table must stay unreadable to the public. With the ANON key this has
--     to come back empty — if it returns rows, a select policy has been added
--     somewhere and the shop's traffic is public:
--
--       curl "$SUPABASE_URL/rest/v1/page_views?select=id&limit=1" \
--            -H "apikey: $ANON_KEY"
--
--  3. Visits per day for the last fortnight, the figure the dashboard panel
--     reports for a month grain:
--
--       select date_trunc('day', created_at)::date as day,
--              count(*) as views,
--              count(distinct visitor_id) as visitors
--         from public.page_views
--        where created_at >= now() - interval '14 days'
--        group by 1
--        order by 1;
--
--  4. HOUSEKEEPING. Nothing prunes this table. One row per page per tab is
--     small, but it only grows — if it ever gets heavy, drop the old rows; no
--     other table references them:
--
--       delete from public.page_views where created_at < now() - interval '1 year';
-- ============================================================================
