create or replace function public.record_order_stock_decrement(_order_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  line record;
  prev_qty int;
  next_qty int;
  target_distributor_id uuid;
begin
  select distributor_id into target_distributor_id from public.orders where id = _order_id;

  for line in select product_id, ordered_qty from public.order_items where order_id = _order_id and product_id is not null loop
    select stock_qty into prev_qty from public.products where id = line.product_id for update;
    if prev_qty is not null then
      next_qty := greatest(prev_qty - line.ordered_qty, 0);
      if next_qty <> prev_qty then
        update public.products set stock_qty = next_qty where id = line.product_id;
        insert into public.inventory_adjustments (product_id, delta, previous_qty, new_qty, reason, note)
        values (line.product_id, next_qty - prev_qty, prev_qty, next_qty, 'order', 'Auto-decrement for order ' || _order_id::text);
      end if;
    end if;

    if target_distributor_id is not null then
      select stock_qty into prev_qty from public.distributor_inventory
        where distributor_id = target_distributor_id and product_id = line.product_id for update;
      if prev_qty is not null then
        next_qty := greatest(prev_qty - line.ordered_qty, 0);
        if next_qty <> prev_qty then
          update public.distributor_inventory set stock_qty = next_qty
            where distributor_id = target_distributor_id and product_id = line.product_id;
          insert into public.inventory_adjustments (product_id, distributor_id, delta, previous_qty, new_qty, reason, note)
          values (line.product_id, target_distributor_id, next_qty - prev_qty, prev_qty, next_qty, 'order', 'Auto-decrement for order ' || _order_id::text);
        end if;
      end if;
    end if;
  end loop;
end;
$$;
