-- =============================================================================
-- rofoof — 0013: Custom order requests (brooch / sticker / poster).
-- Idempotent; run after 0001–0012.
--
-- A custom request is a REGULAR order flagged is_custom, so the entire
-- existing pipeline (status flow, realtime, totals triggers, Telegram,
-- pagination, bulk actions) works on it unchanged. It carries its own
-- type/images/waterproof, and one synthetic order_item drives the money math.
-- Pricing lives in a small admin-editable table and is applied SERVER-SIDE.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDERS — custom request columns
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists is_custom boolean not null default false;
alter table public.orders add column if not exists custom_type text
  check (custom_type in ('brooch', 'sticker', 'poster'));
alter table public.orders add column if not exists custom_images text[] not null default '{}';
alter table public.orders add column if not exists custom_waterproof boolean not null default false;

-- ----------------------------------------------------------------------------
-- 2. PRICING — per-type unit price + waterproof extra (admin edits this table)
-- ----------------------------------------------------------------------------
create table if not exists public.custom_pricing (
  kind             text primary key check (kind in ('brooch', 'sticker', 'poster')),
  unit_price       int not null check (unit_price >= 0),
  waterproof_extra int not null default 0 check (waterproof_extra >= 0)
);

insert into public.custom_pricing (kind, unit_price, waterproof_extra) values
  ('brooch', 3000, 0),
  ('sticker', 1000, 500),
  ('poster', 5000, 1000)
on conflict (kind) do nothing;

alter table public.custom_pricing enable row level security;
drop policy if exists "read custom pricing"        on public.custom_pricing;
drop policy if exists "admin write custom pricing" on public.custom_pricing;
create policy "read custom pricing" on public.custom_pricing for select using (true);
create policy "admin write custom pricing" on public.custom_pricing for all
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. place_custom_request() — validates, prices server-side, creates the order
--    Images must already be uploaded to the public custom-artwork bucket
--    (client converts to WebP first to save storage space).
-- ----------------------------------------------------------------------------
create or replace function public.place_custom_request(
  p_customer_name text,
  p_customer_phone text,
  p_province_code text,
  p_address_line text,
  p_type text,
  p_waterproof boolean,
  p_description text,
  p_images text[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
  v_code text;
  v_total int;
  v_qty int;
  v_unit int;
  v_extra int;
  v_img text;
  v_label_ar text;
  v_label_en text;
begin
  if p_type not in ('brooch', 'sticker', 'poster') then raise exception 'invalid_type'; end if;

  v_qty := coalesce(array_length(p_images, 1), 0);
  if v_qty < 1 or v_qty > 20 then raise exception 'invalid_image_count'; end if;

  -- Only accept artwork that lives in OUR public custom-artwork bucket.
  foreach v_img in array p_images loop
    if v_img is null or length(v_img) > 500
       or position('/storage/v1/object/public/custom-artwork/' in v_img) = 0 then
      raise exception 'invalid_image_url';
    end if;
  end loop;

  -- Waterproof applies to stickers/posters only; brooches ignore the flag.
  if p_type = 'brooch' then p_waterproof := false; end if;

  select unit_price, waterproof_extra into v_unit, v_extra
  from public.custom_pricing where kind = p_type;
  if v_unit is null then raise exception 'pricing_missing'; end if;
  if p_waterproof then v_unit := v_unit + v_extra; end if;

  insert into public.orders (user_id, customer_name, customer_phone, province_code,
    address_line, notes, status, is_custom, custom_type, custom_images, custom_waterproof)
  values (auth.uid(), left(btrim(p_customer_name), 80), left(btrim(p_customer_phone), 20),
    p_province_code, p_address_line, nullif(left(btrim(coalesce(p_description, '')), 1000), ''),
    'review', true, p_type, p_images, coalesce(p_waterproof, false))
  returning id, code into v_order_id, v_code;

  v_label_ar := case p_type when 'brooch' then 'طلب مخصص — بروش'
                            when 'sticker' then 'طلب مخصص — ستكر'
                            else 'طلب مخصص — بوستر' end;
  v_label_en := case p_type when 'brooch' then 'Custom request — Brooch'
                            when 'sticker' then 'Custom request — Sticker'
                            else 'Custom request — Poster' end;

  -- One synthetic line drives subtotal/total via the existing triggers.
  insert into public.order_items
    (order_id, product_id, name_ar_snapshot, name_en_snapshot, unit_price, qty, waterproof)
  values (v_order_id, null, v_label_ar, v_label_en, v_unit, v_qty, coalesce(p_waterproof, false));

  select total into v_total from public.orders where id = v_order_id;
  return jsonb_build_object('code', v_code, 'total', v_total);
end; $$;
grant execute on function public.place_custom_request(text, text, text, text, text, boolean, text, text[])
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. dashboard_stats() — add the custom-requests KPI (count + revenue)
-- ----------------------------------------------------------------------------
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
        group by 1, 2, 3
        order by sold desc
        limit 5
      ) t), '[]'::jsonb)
  ) into v;
  return v;
end; $$;
grant execute on function public.dashboard_stats() to authenticated;

-- =============================================================================
-- Done. Verify:
--   select * from public.custom_pricing;
--   select code, is_custom, custom_type, array_length(custom_images,1)
--     from public.orders where is_custom;
-- =============================================================================
