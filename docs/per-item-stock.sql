-- ============================================================================
-- Per-design stock for package products.
--
-- Run this by hand in the Supabase SQL editor (DDL can't go through the
-- service-role client). The frontend is already deployed and survives without
-- it: reads fall back to the old column set, and until this runs every design
-- reports "not tracked" and stays freely buyable. Nothing breaks either way.
--
-- Run the sections in order. 1 and 2 are what make the feature work at all;
-- 3 is what stops the shop overselling.
-- ============================================================================


-- 1. The column ---------------------------------------------------------------
-- NOT NULL DEFAULT 0 means every existing design starts sold out, which is the
-- safe direction: nothing gets oversold while you fill the real numbers in.
-- If you would rather everything stay buyable until you've counted, change the
-- default to a number you're comfortable with and re-run the UPDATE below.

alter table public.product_items
  add column if not exists stock integer not null default 0;

alter table public.product_items
  add constraint product_items_stock_non_negative check (stock >= 0);

-- Seed every existing design from its parent product's old package-wide stock,
-- so nothing is sold out the moment this lands. Run once.
update public.product_items i
   set stock = greatest(coalesce(p.stock, 0), 0)
  from public.products p
 where p.id = i.product_id
   and i.stock = 0;


-- 2. Let the admin save it ----------------------------------------------------
-- admin_set_product_items already receives `stock` in its JSON payload (the
-- frontend sends it now, and jsonb_to_recordset ignores keys it has no column
-- for — which is why sending it early was safe). This teaches it to read it.
--
-- IMPORTANT: replace the body below with your ACTUAL function body if it
-- differs — this is the shape the app expects, not necessarily what you have.
-- Send me the output of:
--     select pg_get_functiondef('public.admin_set_product_items'::regproc);
-- and I'll adapt it exactly rather than you merging it by hand.

create or replace function public.admin_set_product_items(p_id text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Soft-delete designs that are no longer in the payload.
  update product_items
     set is_deleted = true
   where product_id = p_id
     and id not in (
       select (x->>'id')::uuid
         from jsonb_array_elements(p_items) x
        where x->>'id' is not null
     );

  -- Upsert the ones that are.
  insert into product_items (id, product_id, image_url, name_ar, name_en, price, stock, sort_order)
  select coalesce((x->>'id')::uuid, gen_random_uuid()),
         p_id,
         x->>'image_url',
         coalesce(x->>'name_ar', ''),
         coalesce(x->>'name_en', ''),
         nullif(x->>'price', '')::integer,
         coalesce(nullif(x->>'stock', '')::integer, 0),
         coalesce((x->>'sort_order')::integer, 0)
    from jsonb_array_elements(p_items) x
  on conflict (id) do update
     set image_url  = excluded.image_url,
         name_ar    = excluded.name_ar,
         name_en    = excluded.name_en,
         price      = excluded.price,
         stock      = excluded.stock,
         sort_order = excluded.sort_order,
         is_deleted = false;
end;
$$;


-- 3. Stop overselling at checkout ---------------------------------------------
-- The client greys out a design at 0 and clamps the stepper, but the client is
-- only ever a suggestion — two shoppers can hold the last piece at the same
-- time. place_order() is the only place that can actually decide.
--
-- Add this INSIDE place_order(), in the loop that walks the order items, before
-- any row is written. `for update` takes a row lock so two concurrent orders
-- serialise instead of both reading the same remaining count.

--   -- for each order item that names a package design (v_item_id is not null):
--   select stock into v_stock
--     from product_items
--    where id = v_item_id
--      for update;
--
--   if v_stock < v_qty then
--     raise exception 'out_of_stock:%', v_item_id;
--   end if;
--
--   update product_items
--      set stock = stock - v_qty
--    where id = v_item_id;

-- And the equivalent for one-photo products, which count on products.stock:
--   update products set stock = stock - v_qty where id = v_product_id;

-- Send me the current place_order() source and I'll write this into it
-- properly, including how the error surfaces to the checkout UI:
--     select pg_get_functiondef('public.place_order'::regproc);


-- 4. Check delivery is never discounted ---------------------------------------
-- Confirms the thing you asked me to verify: whatever the discount, delivery is
-- added on top at full price. The client side is proven; this is the server.
-- Expect delivery_fee to equal your configured fee on EVERY row, including any
-- order whose subtotal fully discounted away.

select code,
       subtotal,
       discount_total,
       delivery_fee,
       total,
       total - delivery_fee                          as goods_paid,
       greatest(subtotal - discount_total, 0)        as goods_expected,
       total = greatest(subtotal - discount_total, 0) + delivery_fee as maths_ok
  from public.orders
 order by created_at desc
 limit 50;
