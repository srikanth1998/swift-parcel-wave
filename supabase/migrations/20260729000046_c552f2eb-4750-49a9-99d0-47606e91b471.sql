create or replace function public.sync_supply_hub_stock_to_product()
returns trigger
language plpgsql
set search_path to ''
as $function$
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

  -- Removing a stock row is cleanup (product deletion / cascade), not an edit.
  if tg_op = 'DELETE' then
    return old;
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

  target_qty := new.stock_qty;
  update public.products
    set stock_qty = target_qty
    where id = affected_product_id
      and stock_qty is distinct from target_qty;

  return new;
end;
$function$;