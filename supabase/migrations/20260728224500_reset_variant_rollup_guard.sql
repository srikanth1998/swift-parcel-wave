-- Reset the narrowly scoped rollup bypass immediately after the derived parent
-- update. This keeps the stock guard effective for every other statement in
-- the same transaction.
create or replace function public.sync_variant_product_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_product_id uuid;
  variant_product_id uuid;
  total_stock integer;
  lowest_price integer;
begin
  affected_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;

  select p.id,
         coalesce(sum(v.stock_qty) filter (where v.is_active), 0)::integer,
         min(v.price_cents) filter (where v.is_active)
    into variant_product_id, total_stock, lowest_price
    from public.products p
    left join public.product_variants v on v.product_id = p.id
    where p.id = affected_product_id
      and p.has_variants
    group by p.id;

  if variant_product_id is not null then
    perform set_config('app.variant_rollup', 'on', true);
    update public.products
      set stock_qty = total_stock,
          price_cents = coalesce(lowest_price, price_cents),
          mrp_cents = case
            when lowest_price is not null and mrp_cents < lowest_price then null
            else mrp_cents
          end
      where id = variant_product_id
        and (
          stock_qty is distinct from total_stock
          or (lowest_price is not null and price_cents is distinct from lowest_price)
          or (lowest_price is not null and mrp_cents < lowest_price)
        );
    perform set_config('app.variant_rollup', 'off', true);
  end if;

  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
    select p.id,
           coalesce(sum(v.stock_qty) filter (where v.is_active), 0)::integer,
           min(v.price_cents) filter (where v.is_active)
      into variant_product_id, total_stock, lowest_price
      from public.products p
      left join public.product_variants v on v.product_id = p.id
      where p.id = old.product_id
        and p.has_variants
      group by p.id;

    if variant_product_id is not null then
      perform set_config('app.variant_rollup', 'on', true);
      update public.products
        set stock_qty = total_stock,
            price_cents = coalesce(lowest_price, price_cents),
            mrp_cents = case
              when lowest_price is not null and mrp_cents < lowest_price then null
              else mrp_cents
            end
        where id = variant_product_id;
      perform set_config('app.variant_rollup', 'off', true);
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
