-- =============================================================================
-- rofoof — persist signup details (name, phone, province) into profiles.
-- `create or replace` updates the function the existing on_auth_user_created
-- trigger already calls — no need to recreate the trigger. Run standalone.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, default_province_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'province_code', '')
  )
  on conflict (id) do update
    set full_name             = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone                 = coalesce(excluded.phone, public.profiles.phone),
        default_province_code = coalesce(excluded.default_province_code, public.profiles.default_province_code);
  return new;
end;
$$;

-- Ensure the trigger exists (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
