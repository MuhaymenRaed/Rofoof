-- =============================================================================
-- rofoof — backfill profiles for existing auth.users + harden the trigger.
-- Existing users predate the handle_new_user trigger, so profiles is empty.
-- Run once in the Supabase SQL editor. Idempotent.
-- =============================================================================

-- 1) Hardened trigger: works for Google (full_name / name), never breaks signup
--    on a bad province code, and re-activates a returning user's profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_province text;
begin
  v_province := nullif(new.raw_user_meta_data->>'province_code', '');
  if v_province is not null and not exists (select 1 from public.provinces where code = v_province) then
    v_province := null; -- avoid a foreign-key violation blocking signup
  end if;

  insert into public.profiles (id, full_name, phone, default_province_code)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      ''
    ),
    nullif(new.raw_user_meta_data->>'phone', ''),
    v_province
  )
  on conflict (id) do update
    set full_name             = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        phone                 = coalesce(excluded.phone, public.profiles.phone),
        default_province_code = coalesce(excluded.default_province_code, public.profiles.default_province_code),
        is_deleted            = false,
        deleted_at            = null;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Backfill: create a profile row for every existing auth user that lacks one
insert into public.profiles (id, full_name, phone, default_province_code)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(coalesce(u.email, ''), '@', 1),
    ''
  ),
  nullif(u.raw_user_meta_data->>'phone', ''),
  (select p.code from public.provinces p where p.code = nullif(u.raw_user_meta_data->>'province_code', ''))
from auth.users u
on conflict (id) do nothing;

-- 3) (optional) make yourself admin — replace with your email
-- update public.profiles set role = 'admin'
-- where id = (select id from auth.users where email = 'moheamin852@gmail.com');
