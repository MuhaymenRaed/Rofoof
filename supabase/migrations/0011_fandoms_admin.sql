-- =============================================================================
-- rofoof — DB-driven fandom filter + admin CRUD (idempotent).
-- Fandoms already live in `fandoms` + `product_fandoms`; this adds the admin
-- RPCs so the dashboard can manage them like categories.
-- =============================================================================

-- Admin creates a new fandom
create or replace function public.admin_create_fandom(p_code text, p_name_ar text, p_name_en text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.fandoms%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  insert into public.fandoms (code, name_ar, name_en, sort_order)
  values (p_code, p_name_ar, p_name_en,
          coalesce((select max(sort_order) + 1 from public.fandoms), 1))
  on conflict (code) do update set name_ar = excluded.name_ar, name_en = excluded.name_en
  returning * into v;
  return jsonb_build_object('code', v.code, 'name_ar', v.name_ar, 'name_en', v.name_en);
end; $$;
grant execute on function public.admin_create_fandom(text, text, text) to authenticated;

-- Replace a product's fandom list atomically (empty list allowed)
create or replace function public.admin_set_product_fandoms(p_id text, p_codes text[])
returns text[] language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  delete from public.product_fandoms where product_id = p_id;
  if p_codes is not null and array_length(p_codes, 1) is not null then
    insert into public.product_fandoms (product_id, fandom_code)
      select p_id, unnest(p_codes) on conflict do nothing;
  end if;
  return coalesce(p_codes, '{}');
end; $$;
grant execute on function public.admin_set_product_fandoms(text, text[]) to authenticated;
