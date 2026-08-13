-- ============================================================================
--  ROFOOF — make the dashboard "customers" list show real ACCOUNTS only
--
--  THE PROBLEM
--  The customers list groups orders by the phone number typed at checkout, so
--  the same person shows up once per phone number they ever used. That is why
--  "حيدر الشمري" fills the page: one signed-in account placed test orders with
--  fifteen different phone numbers, and each one became its own "customer".
--
--  THE FIX
--  The customers list now IS the profiles table: one row per real, signed-up
--  account, named from their profile. Guest checkouts (no account) no longer
--  appear on this page at all — their orders are untouched and still show up
--  everywhere else (the Orders tab, the KPI totals), just not in this list.
--
--  HOW TO USE THIS FILE
--  Open the Supabase SQL editor and run the steps IN ORDER:
--
--    STEP 1  rebuild the customers list around profiles only
--    STEP 2  optional health check — run it any time
--
--  It is safe to run this file more than once; it just replaces a function
--  with its new body.
--
--  Nothing here can break the live site. The website already copes with this
--  being missing: until you run it, the customers page keeps behaving exactly
--  as it does today. It also copes with the new shape — an account with no
--  orders yet has null address/status and 0 orders instead of erroring.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  STEP 1 — rebuild the customers list around profiles only
--
--  One row per profile, named from the profile. The order columns (address,
--  status, count) describe that account's most recent order — null / 0 for
--  someone who has signed up but not ordered yet. Guests (orders with no
--  user_id) are never included here.
-- ----------------------------------------------------------------------------
create or replace function public.admin_customers(p_limit integer default 200, p_offset integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.last_active desc nulls last), '[]'::jsonb) into v from (
    select p.id::text as id,
           coalesce(nullif(btrim(p.full_name), ''), '')      as name,
           coalesce(nullif(btrim(p.phone), ''), null)        as phone,
           coalesce(o.province_code, p.default_province_code) as province_code,
           o.address                                         as address,
           o.status                                          as status,
           coalesce(o.orders, 0)                              as orders,
           coalesce(o.last_order, p.created_at)               as last_active
    from public.profiles p
    left join lateral (
      select (array_agg(customer_name  order by created_at desc))[1] as name,
             (array_agg(province_code  order by created_at desc))[1] as province_code,
             (array_agg(address_line   order by created_at desc))[1] as address,
             (array_agg(status         order by created_at desc))[1] as status,
             count(*)::int                                          as orders,
             max(created_at)                                        as last_order
      from public.orders
      where user_id = p.id and not is_deleted
    ) o on true
    order by last_active desc nulls last
    limit greatest(1, least(p_limit, 500)) offset greatest(0, p_offset)
  ) t;

  return v;
end; $function$;


-- ----------------------------------------------------------------------------
--  STEP 2 — optional health check
--
--  Run this any time. Should return exactly the rows in public.profiles.
-- ----------------------------------------------------------------------------
-- select x->>'name' as name, x->>'phone' as phone, x->>'orders' as orders,
--        x->>'status' as status
-- from jsonb_array_elements(public.admin_customers(200, 0)) x;
