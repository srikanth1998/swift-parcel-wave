create or replace function public.approve_stock_transfers_bulk(
  _request_ids uuid[],
  _fulfilled_by_distributor_id uuid,
  _reviewed_by uuid,
  _admin_note text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_request_id uuid;
  current_requested_qty integer;
  approved_count integer := 0;
begin
  if coalesce(cardinality(_request_ids), 0) < 1 then
    raise exception 'Select at least one pending stock request.';
  end if;

  if cardinality(_request_ids) > 100 then
    raise exception 'A maximum of 100 stock requests can be approved at once.';
  end if;

  if exists (
    select 1
    from unnest(_request_ids) as request_ids(value)
    where value is null
  ) then
    raise exception 'Request IDs cannot be empty.';
  end if;

  if cardinality(_request_ids) <> (
    select count(distinct value)
    from unnest(_request_ids) as request_ids(value)
  ) then
    raise exception 'Duplicate stock request IDs are not allowed.';
  end if;

  if not exists (
    select 1
    from public.distributors as distributor
    where distributor.id = _fulfilled_by_distributor_id
      and distributor.is_active
      and distributor.can_supply
  ) then
    raise exception 'Choose the active Main Warehouse as the supply source.';
  end if;

  -- Lock and process by product to keep both request and inventory lock order
  -- stable when admins review overlapping selections. Any failure rolls back
  -- the complete batch.
  for current_request_id, current_requested_qty in
    select request.id, request.requested_qty
    from public.stock_transfer_requests as request
    where request.id = any(_request_ids)
      and request.status = 'pending'
    order by request.product_id, request.id
    for update
  loop
    perform public.approve_stock_transfer(
      current_request_id,
      current_requested_qty,
      _fulfilled_by_distributor_id,
      _reviewed_by,
      coalesce(_admin_note, '')
    );

    approved_count := approved_count + 1;
  end loop;

  if approved_count <> cardinality(_request_ids) then
    raise exception 'One or more selected stock requests are missing or have already been reviewed.';
  end if;

  return approved_count;
end;
$$;

revoke all on function public.approve_stock_transfers_bulk(uuid[], uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.approve_stock_transfers_bulk(uuid[], uuid, uuid, text)
to service_role;
