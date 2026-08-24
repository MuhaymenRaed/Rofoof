-- ============================================================================
--  ROFOOF — the restock queue (dashboard → Restock)
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run the steps IN ORDER:
--
--    STEP 1   four tracking columns on products + product_items
--    STEP 2   admin_restock_queue()        — the list itself
--    STEP 3   admin_restock_item_detail()  — the row's detail panel
--    STEP 4   admin_apply_restock()        — the "add to stock" button
--    STEP 5   admin_set_restock_blacklist()— the blacklist toggle
--
--  It is safe to run this file more than once — every statement does nothing
--  if it has already been applied.
--
--  Nothing here can break the live site. Until you run it, the dashboard's
--  Restock tab simply shows an empty list instead of erroring — the four
--  functions it calls don't exist yet, and the app already knows how to treat
--  that as "not tracked" rather than a failure.
-- ============================================================================



-- ============================================================================
--  STEP 1 — Tracking columns for "already restocked" and "stop tracking this"
-- ============================================================================
--  WHAT THIS DOES
--  Adds four columns to BOTH products and product_items (a package's designs
--  carry their own stock, so they need their own tracking too):
--
--    restock_baseline     how many units-ever-sold had already been dealt
--                          with, the last time an admin restocked this row.
--                          A row needs restocking when the LIVE sold count
--                          rises above this number again.
--    restock_blacklisted  admin said "stop showing me this one".
--    restock_last_qty     how many pieces the last restock added (display only).
--    restocked_at         when that last restock happened (display only).
--
--  WHY A BASELINE NUMBER INSTEAD OF A "NEEDS RESTOCK" FLAG
--  This app already has a flag exactly like that — products.sold_out — and it
--  is a cautionary tale: nothing ever clears it, so a restocked product can
--  stay marked sold out forever (see lib/products.ts, isSoldOut()). A flag
--  someone has to remember to unset always ends up stuck eventually.
--
--  A baseline avoids that by construction. "Needs restock" is never stored —
--  it's recomputed on every read as (units sold, ever) − (baseline). Restock
--  the row and the baseline catches up to the live sold count, so the
--  difference goes back to zero on its own. Nothing can leave it stranded.
-- ----------------------------------------------------------------------------

alter table public.products
  add column if not exists restock_baseline integer not null default 0,
  add column if not exists restock_blacklisted boolean not null default false,
  add column if not exists restock_last_qty integer,
  add column if not exists restocked_at timestamptz;

alter table public.product_items
  add column if not exists restock_baseline integer not null default 0,
  add column if not exists restock_blacklisted boolean not null default false,
  add column if not exists restock_last_qty integer,
  add column if not exists restocked_at timestamptz;



-- ============================================================================
--  STEP 2 — admin_restock_queue()  (the list)
-- ============================================================================
--  Returns one row per "shelf unit" that has sold since it was last restocked:
--  a whole product for standard/tiered kinds, or one design (product_items
--  row) for a package — the same split every other stock feature in this app
--  uses (see totalStockFor/stockCeilingFor in lib/products.ts, and
--  admin_set_order_stock's own "group by product_id, item_id").
--
--  "Sold" means the order actually took the stock — orders.stock_applied —
--  not merely placed. An order sitting in review holds no stock yet, exactly
--  like the rest of the app already treats it (see updateOrderStatusAction).
-- ----------------------------------------------------------------------------

create or replace function public.admin_restock_queue(
  p_search text default null,
  p_categories text[] default null,
  p_kind text default null,
  p_sort text default 'demand_desc',
  p_blacklisted boolean default false,
  p_limit int default 21,
  p_offset int default 0
)
returns jsonb
language plpgsql
security definer
--  'extensions' is NOT optional here. pg_trgm — which provides similarity()
--  for the typo-tolerant search below — lives in the `extensions` schema on
--  Supabase, not in `public`. With search_path = 'public' alone, Postgres
--  cannot resolve similarity() when it PLANS this query, and planning covers
--  the whole statement regardless of whether p_search is null — so every call
--  failed, empty search included, and the queue came back empty.
set search_path to 'public', 'extensions'
as $function$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  with sold as (
    -- Units actually taken off the shelf, ever, per shelf unit.
    select oi.product_id, oi.item_id, sum(oi.qty)::int as lifetime_sold,
           count(distinct oi.order_id)::int as orders_count,
           max(o.created_at) as last_sold_at
      from public.order_items oi
      join public.orders o on o.id = oi.order_id and o.stock_applied = true
     where oi.product_id is not null
     group by oi.product_id, oi.item_id
  ),
  -- Named `shelf`, not `rows`: ROWS is a Postgres keyword, and while it is
  -- legal as a CTE name, `from rows r` is exactly the shape where that bites.
  shelf as (
    -- Standard / tiered products: the product row itself is the shelf unit.
    select
      p.id as product_id, null::uuid as item_id,
      p.name_ar, p.name_en, null::text as item_name_ar, null::text as item_name_en,
      coalesce(p.image_url, p.images[1]) as image_url,
      -- kind::text, NOT the bare column. products.kind is the enum
      -- `product_kind`, and p_kind arrives as text — Postgres has no
      -- `product_kind = text` operator, so the filter below (r.kind = p_kind)
      -- failed to plan and took the WHOLE query down on every call, whether or
      -- not a kind filter was actually chosen. Casting once here keeps every
      -- downstream reference plain text.
      p.category_code, p.kind::text as kind, p.stock,
      s.lifetime_sold, s.orders_count, s.last_sold_at,
      p.restock_baseline, p.restock_blacklisted, p.restock_last_qty, p.restocked_at,
      p.created_at
      from public.products p
      join sold s on s.product_id = p.id and s.item_id is null
     where p.is_deleted = false
       and p.kind <> 'package'

    union all

    -- Package products: each design is its own shelf unit.
    select
      p.id as product_id, i.id as item_id,
      p.name_ar, p.name_en, i.name_ar as item_name_ar, i.name_en as item_name_en,
      i.image_url,
      p.category_code, p.kind::text as kind, i.stock,
      s.lifetime_sold, s.orders_count, s.last_sold_at,
      i.restock_baseline, i.restock_blacklisted, i.restock_last_qty, i.restocked_at,
      p.created_at
      from public.product_items i
      join public.products p on p.id = i.product_id
      join sold s on s.product_id = i.product_id and s.item_id = i.id
     where p.is_deleted = false
       and i.is_deleted = false
  ),
  filtered as (
    select r.*, (r.lifetime_sold - coalesce(r.restock_baseline, 0)) as sold_since_restock
      from shelf r
     where r.restock_blacklisted = p_blacklisted
       -- The main queue only ever shows a row with real pending demand. The
       -- blacklist view is a permanent "muted" list instead — it must NOT
       -- drop a row just because its sold-since-restock happens to read zero
       -- (e.g. it was restocked right before being muted), or an admin could
       -- blacklist something and then have no way to find it again to undo.
       and (p_blacklisted or (r.lifetime_sold - coalesce(r.restock_baseline, 0)) > 0)
       and (p_kind is null or r.kind = p_kind)
       and (
         p_categories is null or cardinality(p_categories) = 0
         or r.category_code = any(p_categories)
         or exists (
           select 1 from public.product_categories pc
            where pc.product_id = r.product_id and pc.category_code = any(p_categories)
         )
       )
       and (
         -- position(needle in haystack) instead of ILIKE '%needle%': no
         -- string-concatenation operator needed to build the wildcard pattern.
         v_search is null
         or position(lower(v_search) in lower(r.name_ar)) > 0
         or position(lower(v_search) in lower(r.name_en)) > 0
         or position(lower(v_search) in lower(coalesce(r.item_name_ar, ''))) > 0
         or position(lower(v_search) in lower(coalesce(r.item_name_en, ''))) > 0
         or similarity(r.name_ar, v_search) > 0.25
         or similarity(r.name_en, v_search) > 0.25
         or similarity(coalesce(r.item_name_ar, ''), v_search) > 0.25
         or similarity(coalesce(r.item_name_en, ''), v_search) > 0.25
       )
  ),
  -- Sort over the WHOLE filtered set first, number the rows, and only then
  -- page — limiting before sorting would hand back an arbitrary p_limit rows
  -- and sort just those, which is a different (wrong) page every time.
  sorted as (
    select f.*, row_number() over (order by
      case when p_sort = 'demand_desc' then f.sold_since_restock end desc,
      case when p_sort = 'date_asc' then f.created_at end asc,
      case when p_sort = 'date_desc' then f.created_at end desc,
      case when p_sort = 'orders_asc' then f.orders_count end asc,
      case when p_sort = 'orders_desc' then f.orders_count end desc,
      f.sold_since_restock desc, f.product_id, f.item_id
    ) as rn
    from filtered f
  )
  select jsonb_agg((to_jsonb(s.*) - 'rn') order by s.rn)
    into v_result
    from sorted s
   where s.rn > p_offset and s.rn <= p_offset + p_limit;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

grant execute on function public.admin_restock_queue(text, text[], text, text, boolean, int, int)
  to authenticated, service_role;



-- ============================================================================
--  STEP 3 — admin_restock_item_detail()  (the row's detail panel)
-- ============================================================================
--  Same stats as one queue row, plus the last 10 orders that touched this
--  exact shelf unit, for the "recent orders" list in the modal.
-- ----------------------------------------------------------------------------

--  p_product_id is TEXT, not uuid: products.id holds slugs
--  ('cod-ps-keychains-e8jt'), while product_items.id is a real uuid. The
--  earlier uuid signature could never have matched a product.
--  Dropped first because changing an argument TYPE with CREATE OR REPLACE adds
--  a second overload rather than replacing the first, and PostgREST then can't
--  tell which one a call means.
drop function if exists public.admin_restock_item_detail(uuid, uuid);

create or replace function public.admin_restock_item_detail(
  p_product_id text,
  p_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb;
  v_orders jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select to_jsonb(t.*) into v_row
    from (
      select
        p.id as product_id, i.id as item_id,
        p.name_ar, p.name_en, i.name_ar as item_name_ar, i.name_en as item_name_en,
        coalesce(i.image_url, p.image_url, p.images[1]) as image_url,
        -- ::text so the detail panel's JSON carries `kind` in exactly the same
        -- shape the queue does (see the cast in admin_restock_queue).
        p.category_code, p.kind::text as kind,
        coalesce(i.stock, p.stock) as stock,
        coalesce(i.restock_baseline, p.restock_baseline) as restock_baseline,
        coalesce(i.restock_blacklisted, p.restock_blacklisted) as restock_blacklisted,
        coalesce(i.restock_last_qty, p.restock_last_qty) as restock_last_qty,
        coalesce(i.restocked_at, p.restocked_at) as restocked_at,
        p.created_at,
        coalesce(sum(oi.qty) filter (where o.stock_applied), 0)::int as lifetime_sold,
        (count(distinct oi.order_id) filter (where o.stock_applied))::int as orders_count
        from public.products p
        left join public.product_items i on i.id = p_item_id and i.product_id = p.id
        left join public.order_items oi
          on oi.product_id = p.id
         and ((p_item_id is null and oi.item_id is null) or oi.item_id = p_item_id)
        left join public.orders o on o.id = oi.order_id
       where p.id = p_product_id
       group by p.id, i.id
    ) t;

  if v_row is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(r.*) order by r.created_at desc), '[]'::jsonb)
    into v_orders
    from (
      select o.code, o.created_at, oi.qty
        from public.order_items oi
        join public.orders o on o.id = oi.order_id and o.stock_applied = true
       where oi.product_id = p_product_id
         and ((p_item_id is null and oi.item_id is null) or oi.item_id = p_item_id)
       order by o.created_at desc
       limit 10
    ) r;

  return jsonb_set(v_row, '{recent_orders}', v_orders, true);
end;
$function$;

grant execute on function public.admin_restock_item_detail(text, uuid) to authenticated, service_role;



-- ============================================================================
--  STEP 4 — admin_apply_restock()  (the "add to stock" button)
-- ============================================================================
--  Adds p_qty to the shelf and moves the baseline up to the current lifetime
--  sold count in the SAME statement, so the row drops out of the queue the
--  instant this returns — no separate "read, then write" round trip for
--  another sale to sneak into.
-- ----------------------------------------------------------------------------

drop function if exists public.admin_apply_restock(uuid, uuid, int);

create or replace function public.admin_apply_restock(
  p_product_id text,
  p_item_id uuid,
  p_qty int
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lifetime_sold int;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'invalid_qty';
  end if;

  select coalesce(sum(oi.qty), 0)::int into v_lifetime_sold
    from public.order_items oi
    join public.orders o on o.id = oi.order_id and o.stock_applied = true
   where oi.product_id = p_product_id
     and ((p_item_id is null and oi.item_id is null) or oi.item_id = p_item_id);

  if p_item_id is not null then
    update public.product_items
       set stock = stock + p_qty,
           restock_baseline = v_lifetime_sold,
           restock_last_qty = p_qty,
           restocked_at = now()
     where id = p_item_id and product_id = p_product_id;
    if not found then raise exception 'not_found'; end if;
  else
    update public.products
       set stock = stock + p_qty,
           restock_baseline = v_lifetime_sold,
           restock_last_qty = p_qty,
           restocked_at = now()
     where id = p_product_id;
    if not found then raise exception 'not_found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'lifetime_sold', v_lifetime_sold);
end;
$function$;

grant execute on function public.admin_apply_restock(text, uuid, int) to authenticated, service_role;



-- ============================================================================
--  STEP 5 — admin_set_restock_blacklist()  (the blacklist toggle)
-- ============================================================================
--  No stock change — just moves the row in or out of the tracked queue.
-- ----------------------------------------------------------------------------

drop function if exists public.admin_set_restock_blacklist(uuid, uuid, boolean);

create or replace function public.admin_set_restock_blacklist(
  p_product_id text,
  p_item_id uuid,
  p_blacklisted boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_item_id is not null then
    update public.product_items set restock_blacklisted = p_blacklisted
     where id = p_item_id and product_id = p_product_id;
    if not found then raise exception 'not_found'; end if;
  else
    update public.products set restock_blacklisted = p_blacklisted
     where id = p_product_id;
    if not found then raise exception 'not_found'; end if;
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.admin_set_restock_blacklist(text, uuid, boolean)
  to authenticated, service_role;
-- ============================================================================
