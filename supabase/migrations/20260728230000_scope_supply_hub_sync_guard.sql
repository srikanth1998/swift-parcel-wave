-- Product-to-hub mirroring is an authorized derived write. Mark that narrow
-- scope so the reverse trigger can distinguish it from a direct parent-stock
-- edit.
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

  perform set_config('app.product_to_supply_hub', 'on', true);
  insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
  values (supply_hub_id, new.id, new.stock_qty)
  on conflict (distributor_id, product_id) do update
    set stock_qty = excluded.stock_qty
    where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;
  perform set_config('app.product_to_supply_hub', 'off', true);

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
  target_has_variants boolean;
begin
  affected_distributor_id := case when tg_op = 'DELETE' then old.distributor_id else new.distributor_id end;
  affected_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;

  if not exists (
    select 1
    from public.distributors
    where id = affected_distributor_id
      and can_supply = true
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select p.has_variants
    into target_has_variants
    from public.products p
    where p.id = affected_product_id;

  if target_has_variants
     and coalesce(current_setting('app.variant_rollup', true), '') <> 'on'
     and coalesce(current_setting('app.product_to_supply_hub', true), '') <> 'on' then
    raise exception 'Main Warehouse stock for a variant product must be changed on its variants.';
  end if;

  target_qty := case when tg_op = 'DELETE' then 0 else new.stock_qty end;
  update public.products
    set stock_qty = target_qty
    where id = affected_product_id
      and stock_qty is distinct from target_qty;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.sync_product_stock_to_supply_hub() from public;
revoke all on function public.sync_supply_hub_stock_to_product() from public;
