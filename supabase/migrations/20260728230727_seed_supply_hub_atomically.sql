create or replace function public.seed_supply_hub_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.can_supply then
    return new;
  end if;

  perform set_config('app.product_to_supply_hub', 'on', true);
  insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
  select new.id, product.id, product.stock_qty
  from public.products product
  on conflict (distributor_id, product_id) do update
    set stock_qty = excluded.stock_qty,
        updated_at = now()
    where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;
  perform set_config('app.product_to_supply_hub', 'off', true);

  return new;
end;
$$;

drop trigger if exists seed_supply_hub_inventory on public.distributors;
create trigger seed_supply_hub_inventory
  after insert or update of can_supply
  on public.distributors
  for each row
  when (new.can_supply)
  execute function public.seed_supply_hub_inventory();

-- Repair any supply hub created by the former two-step application flow.
select set_config('app.product_to_supply_hub', 'on', true);
insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
select distributor.id, product.id, product.stock_qty
from public.distributors distributor
cross join public.products product
where distributor.can_supply
on conflict (distributor_id, product_id) do update
  set stock_qty = excluded.stock_qty,
      updated_at = now()
  where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;
select set_config('app.product_to_supply_hub', 'off', true);

revoke all on function public.seed_supply_hub_inventory() from public;
