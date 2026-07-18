-- FEABazaar has one central supply warehouse. The catalog/admin stock value
-- and that warehouse's distributor_inventory row represent the same stock.
create unique index if not exists distributors_single_supply_hub_idx
  on public.distributors ((can_supply))
  where can_supply = true;

create or replace function public.sync_product_stock_to_supply_hub()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  supply_hub_id uuid;
begin
  select id
    into supply_hub_id
    from public.distributors
    where can_supply = true
    order by created_at
    limit 1;

  if supply_hub_id is null then
    return new;
  end if;

  insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
  values (supply_hub_id, new.id, new.stock_qty)
  on conflict (distributor_id, product_id) do update
    set stock_qty = excluded.stock_qty
    where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;

  return new;
end;
$$;

create or replace function public.sync_supply_hub_stock_to_product()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_distributor_id uuid;
  affected_product_id uuid;
  target_qty integer;
begin
  affected_distributor_id := case when tg_op = 'DELETE' then old.distributor_id else new.distributor_id end;
  affected_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;

  if not exists (
    select 1
    from public.distributors
    where id = affected_distributor_id
      and can_supply = true
  ) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  target_qty := case when tg_op = 'DELETE' then 0 else new.stock_qty end;

  update public.products
    set stock_qty = target_qty
    where id = affected_product_id
      and stock_qty is distinct from target_qty;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_product_stock_to_supply_hub_on_insert on public.products;
create trigger sync_product_stock_to_supply_hub_on_insert
  after insert on public.products
  for each row
  execute function public.sync_product_stock_to_supply_hub();

drop trigger if exists sync_product_stock_to_supply_hub_on_update on public.products;
create trigger sync_product_stock_to_supply_hub_on_update
  after update of stock_qty on public.products
  for each row
  when (old.stock_qty is distinct from new.stock_qty)
  execute function public.sync_product_stock_to_supply_hub();

drop trigger if exists sync_supply_hub_stock_to_product on public.distributor_inventory;
create trigger sync_supply_hub_stock_to_product
  after insert or delete or update of stock_qty, distributor_id, product_id
  on public.distributor_inventory
  for each row
  execute function public.sync_supply_hub_stock_to_product();

-- The admin/catalog value is the intended Main Warehouse quantity today.
-- Reconcile existing rows once, then the triggers keep both paths aligned.
insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
select d.id, p.id, p.stock_qty
from public.distributors d
cross join public.products p
where d.can_supply = true
on conflict (distributor_id, product_id) do update
  set stock_qty = excluded.stock_qty
  where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;

-- Orders consume stock only from the warehouse assigned to that order. When
-- the assigned warehouse is Main Warehouse, the trigger above also updates
-- products.stock_qty. Local-distributor orders must not consume Main stock.
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
  select distributor_id
    into target_distributor_id
    from public.orders
    where id = _order_id;

  if target_distributor_id is null then
    return;
  end if;

  for line in
    select product_id, ordered_qty
    from public.order_items
    where order_id = _order_id
      and product_id is not null
  loop
    select stock_qty
      into prev_qty
      from public.distributor_inventory
      where distributor_id = target_distributor_id
        and product_id = line.product_id
      for update;

    if prev_qty is not null then
      next_qty := greatest(prev_qty - line.ordered_qty, 0);
      if next_qty <> prev_qty then
        update public.distributor_inventory
          set stock_qty = next_qty
          where distributor_id = target_distributor_id
            and product_id = line.product_id;

        insert into public.inventory_adjustments (
          product_id,
          distributor_id,
          delta,
          previous_qty,
          new_qty,
          reason,
          note
        ) values (
          line.product_id,
          target_distributor_id,
          next_qty - prev_qty,
          prev_qty,
          next_qty,
          'order',
          'Auto-decrement for order ' || _order_id::text
        );
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_product_stock_to_supply_hub() from public;
revoke all on function public.sync_supply_hub_stock_to_product() from public;
