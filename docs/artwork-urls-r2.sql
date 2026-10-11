-- ============================================================================
--  LET CHECKOUT ACCEPT ARTWORK THAT LIVES ON R2
--  Run this by hand in the Supabase SQL editor. It is the fix for a LIVE
--  OUTAGE — every order carrying a custom design is being refused right now.
-- ============================================================================
--
--  WHAT BROKE
--  Media moved from Supabase Storage to Cloudflare R2 on 2026-10-11
--  (docs/media-urls-to-r2.sql). Two SECURITY DEFINER functions still insisted
--  that customer artwork carry the old Supabase path:
--
--      position('/storage/v1/object/public/custom-artwork/' in v_cimg) = 0
--        → raise exception 'invalid_image_url'
--
--  New uploads are at https://media.rofoof.net/custom-artwork/…, which contains
--  no such segment, so place_order() rejected the whole basket. The checkout
--  showed the generic "تعذّر إتمام الطلب" and the sale was lost. Measured on
--  the live project: 15 of 17 place_order calls on 2026-10-11 answered 400,
--  every one of them `invalid_image_url` raised at place_order line 245. The
--  two that succeeded were product-only baskets, which never reach this check.
--
--  WHAT THIS CHANGES
--  One helper, is_artwork_url(), becomes the single place that knows where
--  artwork may live, and both functions call it. The next host change is then a
--  one-line migration instead of two rewrites of a 440-line function.
--
--  Both hosts are accepted. Not for the database's sake — every custom_images
--  row was repointed to R2 already — but because a shopper's CART lives in
--  their browser's localStorage, and one filled before the move still holds
--  Supabase URLs. Those files no longer exist there (the bucket was emptied),
--  so lib/media.ts rewrites them to the R2 host on the way in; this clause is
--  the belt to that braces, and can be dropped once no such cart can plausibly
--  still be open.
--
--  IT ALSO CLOSES A SMALL HOLE
--  `position(… in url) = 0` matched the fragment ANYWHERE in the string, so
--  https://evil.example/storage/v1/object/public/custom-artwork/x.webp passed.
--  Customer artwork is linked from the admin's orders board with
--  target="_blank", so that was an attacker-chosen URL an admin would click.
--  The new test is anchored with `like 'https://…/%'`.
--
--  SAFE TO RE-RUN
--  The DO block below reads each function's CURRENT definition and patches it,
--  so it is a no-op the second time — the fragment it looks for is gone. It
--  raises rather than half-applying if either target has moved.
--
--  NOTHING ELSE IS TOUCHED
--  No table, no row, no grant. CREATE OR REPLACE keeps each function's owner,
--  SECURITY DEFINER flag, search_path and privileges exactly as they are.
-- ============================================================================

-- Where customer artwork may live --------------------------------------------

create or replace function public.is_artwork_url(p_url text)
returns boolean
language sql
immutable
parallel safe
as $fn$
  select p_url is not null
     and length(p_url) <= 500
     and (
          p_url like 'https://media.rofoof.net/custom-artwork/%'
       or p_url like 'https://kzcsriqzxgcdeikjmivg.supabase.co/storage/v1/object/public/custom-artwork/%'
     )
$fn$;

comment on function public.is_artwork_url(text) is
  'Is this customer artwork in OUR storage? Accepts the R2 host (media.rofoof.net, live 2026-10-11) and the retired Supabase path, because a cart saved before the move still holds the old form. Anchored at the start deliberately: the position() test this replaced also accepted https://evil.example/storage/v1/object/public/custom-artwork/x.webp.';

-- Point both functions at it --------------------------------------------------

do $mig$
declare
  -- function, and the loop variable holding the URL inside it
  v_targets text[][] := array[
    ['public.place_order(text,text,text,text,text,text,jsonb,jsonb,text)', 'v_cimg'],
    ['public.place_custom_request(text,text,text,text,text,boolean,text,text[])', 'v_img']
  ];
  i          int;
  v_fn       regprocedure;
  v_src      text;
  v_old_frag text;
  v_new_frag text;
  v_patched  int := 0;
begin
  for i in 1 .. array_length(v_targets, 1) loop
    v_fn       := v_targets[i][1]::regprocedure;
    v_old_frag := format($f$position('/storage/v1/object/public/custom-artwork/' in %s) = 0$f$, v_targets[i][2]);
    v_new_frag := format('not public.is_artwork_url(%s)', v_targets[i][2]);
    v_src      := pg_get_functiondef(v_fn);

    if position(v_old_frag in v_src) > 0 then
      execute replace(v_src, v_old_frag, v_new_frag);
      v_patched := v_patched + 1;
      raise notice 'patched %', v_fn;
    elsif position(v_new_frag in v_src) > 0 then
      raise notice 'already patched, skipping %', v_fn;
    else
      -- Neither shape found: the function has changed under this migration.
      -- Stop rather than leave one of the two patched.
      raise exception 'patch target not found in % — review by hand', v_fn;
    end if;
  end loop;

  raise notice 'done: % function(s) patched', v_patched;
end
$mig$;

-- ============================================================================
--  VERIFY
-- ============================================================================
--  1. Both functions now call the helper, and neither still has the old test:
--
--       select p.proname,
--              p.prosrc ilike '%is_artwork_url%'                      as uses_helper,
--              p.prosrc ilike '%position(''/storage/v1/object/public/custom-artwork/%' as old_test_left
--         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--        where n.nspname = 'public'
--          and p.proname in ('place_order', 'place_custom_request');
--
--     → uses_helper true, old_test_left false, for both rows.
--
--  2. The helper agrees with reality:
--
--       select public.is_artwork_url('https://media.rofoof.net/custom-artwork/a.webp')              as r2_ok,       -- t
--              public.is_artwork_url('https://evil.example/storage/v1/object/public/custom-artwork/a.webp') as spoof_blocked, -- f
--              public.is_artwork_url('https://media.rofoof.net/product-images/a.webp')              as wrong_prefix; -- f
--
--  3. Then place a real custom-design order from a phone. It should reach the
--     success screen with an order code.
--
-- ============================================================================
--  ROLLBACK
-- ============================================================================
--  Restores the pre-R2 behaviour, i.e. puts the outage back. Only useful if the
--  helper itself turns out to be wrong:
--
--    create or replace function public.is_artwork_url(p_url text)
--    returns boolean language sql immutable parallel safe as $fn$
--      select p_url is not null and length(p_url) <= 500
--         and position('/storage/v1/object/public/custom-artwork/' in p_url) > 0
--    $fn$;
--
--  Both functions pick that up immediately — no second rewrite needed, which is
--  the point of routing them through one helper.
-- ============================================================================
