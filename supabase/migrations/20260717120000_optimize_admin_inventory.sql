create index if not exists products_stock_qty_name_idx
  on public.products (stock_qty, name);

create index if not exists inventory_adjustments_created_at_product_id_idx
  on public.inventory_adjustments (created_at desc, product_id);

create or replace function public.get_admin_inventory_stats()
returns table (
  total_products bigint,
  low_stock bigint,
  out_of_stock bigint,
  total_units bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint as total_products,
    count(*) filter (where stock_qty > 0 and stock_qty <= 10)::bigint as low_stock,
    count(*) filter (where stock_qty <= 0)::bigint as out_of_stock,
    coalesce(sum(stock_qty), 0)::bigint as total_units
  from public.products;
$$;

revoke all on function public.get_admin_inventory_stats() from public;
grant execute on function public.get_admin_inventory_stats() to service_role;

create or replace function public.adjust_inventory_atomic(
  _product_id uuid,
  _mode text,
  _amount integer,
  _reason public.inventory_reason_enum,
  _note text,
  _created_by uuid
)
returns table (
  previous_qty integer,
  new_qty integer,
  delta integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_qty integer;
  target_qty_bigint bigint;
  target_qty integer;
  computed_delta integer;
begin
  if _mode not in ('set', 'delta') then
    raise exception 'Invalid adjustment mode.';
  end if;
  if abs(_amount::bigint) > 1000000 then
    raise exception 'Quantity must be 1,000,000 or less.';
  end if;
  if _note is not null and length(_note) > 300 then
    raise exception 'Note must be 300 characters or fewer.';
  end if;

  select stock_qty
    into current_qty
    from public.products
    where id = _product_id
    for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  target_qty_bigint := case
    when _mode = 'set' then _amount::bigint
    else current_qty::bigint + _amount::bigint
  end;
  if target_qty_bigint < 0 then
    raise exception 'Stock cannot go below zero.';
  end if;
  if target_qty_bigint > 2147483647 then
    raise exception 'Stock exceeds the supported quantity.';
  end if;

  target_qty := target_qty_bigint::integer;

  computed_delta := target_qty - current_qty;
  if computed_delta = 0 then
    raise exception 'No change to apply.';
  end if;

  update public.products
    set stock_qty = target_qty
    where id = _product_id;

  insert into public.inventory_adjustments (
    product_id,
    delta,
    previous_qty,
    new_qty,
    reason,
    note,
    created_by
  ) values (
    _product_id,
    computed_delta,
    current_qty,
    target_qty,
    _reason,
    nullif(btrim(_note), ''),
    _created_by
  );

  return query select current_qty, target_qty, computed_delta;
end;
$$;

revoke all on function public.adjust_inventory_atomic(
  uuid,
  text,
  integer,
  public.inventory_reason_enum,
  text,
  uuid
) from public;
grant execute on function public.adjust_inventory_atomic(
  uuid,
  text,
  integer,
  public.inventory_reason_enum,
  text,
  uuid
) to service_role;
