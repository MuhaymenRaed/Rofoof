-- ============================================================================
--  MANUAL ORDERS IN THE STATISTICS                     run in the SQL editor
-- ============================================================================
--
--  CONTEXT — what was already fine
--
--  A manual (hand-priced) order's MONEY was never missing from the dashboard.
--  Its subtotal, delivery fee and total are ordinary columns on `orders`, and
--  every revenue figure sums those, so an admin order counted the moment it was
--  placed. Verified against a live order: RFQ-8970 at 15,000 IQD was already
--  inside the 562,380 the period panel reported.
--
--  What this fixes is the two places it was counted WRONGLY or not shown at all.
--
--  1. top_products listed things that are not products.
--
--     The query grouped every order_items row, and a custom request or a manual
--     job carries product_id = null. So "أفضل المنتجات" was ranking buckets
--     called "طلب مخصص — ستكر" (236 units) and "بروش" (44 units) above every
--     real product, plus one row per manual job — all with a null id, which is
--     not something the panel can link to or a figure the shop can act on.
--     Non-catalogue lines are now excluded; their revenue still counts
--     everywhere revenue is counted, it just stops impersonating a product.
--
--  2. A manual order had no stat of its own.
--
--     is_custom is deliberately false for one — it is not a customer's custom
--     design request — so it appeared in the totals but nowhere as a category,
--     which is what made it look like nothing had happened. It gets its own
--     count and revenue now, beside the custom-request pair.
--
--  SAFE TO RUN
--  Same name, no arguments, same return type: a true CREATE OR REPLACE, so the
--  existing grant survives. The frontend treats both new keys as optional and
--  reads them as 0 when absent, so it works against the old function too.
-- ============================================================================

begin;

create or replace function public.dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'in_stock',        (select count(*) from public.products where is_active and stock > 0 and not is_deleted),
    'total_products',  (select count(*) from public.products where not is_deleted),
    'low_stock',       (select count(*) from public.products where is_active and stock between 1 and 5 and not is_deleted),
    'out_of_stock',    (select count(*) from public.products where is_active and stock <= 0 and not is_deleted),
    'on_discount',     (select count(*) from public.products where is_active and discount_percent > 0 and not is_deleted),
    'new_users',       (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'total_customers', (select count(distinct customer_phone) from public.orders),
    'active_orders',   (select count(*) from public.orders where status in ('review','accepted','shipped')),
    'delivered_orders',(select count(*) from public.orders where status = 'delivered'),
    'total_orders',    (select count(*) from public.orders),
    'custom_orders',   (select count(*) from public.orders where is_custom),
    'custom_revenue',  (select coalesce(sum(total), 0) from public.orders where is_custom and status <> 'review'),

    -- NEW: admin-created manual orders, identified by their line rather than by
    -- a column on `orders` — `custom_kind = 'manual'` is set by place_order and
    -- is the only durable mark a manual line carries. `distinct` because one
    -- order can hold several manual lines and must still count once.
    'manual_orders',   (select count(distinct o.id)
                        from public.orders o
                        join public.order_items oi on oi.order_id = o.id
                        where oi.custom_kind = 'manual'),
    -- Revenue attributed to the manual LINES, not to their whole orders: a
    -- basket can mix a manual line with ordinary products, and charging the
    -- whole basket to "manual" would double-count against product revenue.
    'manual_revenue',  (select coalesce(sum(oi.line_total), 0)
                        from public.order_items oi
                        join public.orders o on o.id = oi.order_id
                        where oi.custom_kind = 'manual' and o.status <> 'review'),

    'revenue',         (select coalesce(sum(total), 0) from public.orders where status <> 'review'),
    'revenue_30d',     (select coalesce(sum(total), 0) from public.orders
                        where status <> 'review' and created_at > now() - interval '30 days'),
    'avg_order',       (select coalesce(round(avg(total))::int, 0) from public.orders where status <> 'review'),
    'top_products',    coalesce((
      select jsonb_agg(t) from (
        select oi.product_id as id,
               oi.name_ar_snapshot as name_ar, oi.name_en_snapshot as name_en,
               sum(oi.qty)::int as sold, sum(oi.line_total)::int as revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.status <> 'review'
          -- THE FIX: catalogue products only. A custom request and a manual job
          -- both carry product_id = null and were being ranked as products.
          and oi.product_id is not null
        group by 1, 2, 3
        order by sold desc
        limit 5
      ) t), '[]'::jsonb)
  ) into v;
  return v;
end; $$;

commit;

-- ============================================================================
--  VERIFY
-- ============================================================================
--  Top products should now be five real catalogue rows, every id non-null:
--    select jsonb_pretty(public.dashboard_stats() -> 'top_products');
--
--  The manual pair should be present and non-zero once an admin order exists:
--    select public.dashboard_stats() -> 'manual_orders',
--           public.dashboard_stats() -> 'manual_revenue';
--
--  Both must be run as an admin — dashboard_stats() raises `forbidden`
--  otherwise, which is also why it cannot be called with the service-role key.
-- ============================================================================
