-- Atomically move approved stock from the supplying distributor to the
-- requester and write both sides of the inventory ledger.
create or replace function public.approve_stock_transfer(
  _request_id uuid,
  _approved_qty integer,
  _fulfilled_by_distributor_id uuid,
  _reviewed_by uuid,
  _admin_note text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  req record;
  supplier_prev_qty integer;
  supplier_next_qty integer;
  requester_prev_qty integer;
  requester_next_qty integer;
begin
  select *
  into req
  from public.stock_transfer_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Stock transfer request not found';
  end if;

  if req.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if _approved_qty <= 0 then
    raise exception 'Approved quantity must be greater than zero';
  end if;

  select stock_qty
  into supplier_prev_qty
  from public.distributor_inventory
  where distributor_id = _fulfilled_by_distributor_id
    and product_id = req.product_id
  for update;

  if supplier_prev_qty is null then
    raise exception 'The fulfilling distributor has no recorded stock for this product';
  end if;

  if supplier_prev_qty < _approved_qty then
    raise exception 'The fulfilling distributor only has % units in stock', supplier_prev_qty;
  end if;

  supplier_next_qty := supplier_prev_qty - _approved_qty;

  update public.distributor_inventory
  set stock_qty = supplier_next_qty
  where distributor_id = _fulfilled_by_distributor_id
    and product_id = req.product_id;

  insert into public.inventory_adjustments (
    product_id,
    distributor_id,
    delta,
    previous_qty,
    new_qty,
    reason,
    note
  )
  values (
    req.product_id,
    _fulfilled_by_distributor_id,
    -_approved_qty,
    supplier_prev_qty,
    supplier_next_qty,
    'correction',
    'Transfer out to fulfil stock request ' || _request_id::text
  );

  select stock_qty
  into requester_prev_qty
  from public.distributor_inventory
  where distributor_id = req.requesting_distributor_id
    and product_id = req.product_id
  for update;

  if requester_prev_qty is null then
    requester_prev_qty := 0;

    insert into public.distributor_inventory (
      distributor_id,
      product_id,
      stock_qty
    )
    values (
      req.requesting_distributor_id,
      req.product_id,
      0
    );
  end if;

  requester_next_qty := requester_prev_qty + _approved_qty;

  update public.distributor_inventory
  set stock_qty = requester_next_qty
  where distributor_id = req.requesting_distributor_id
    and product_id = req.product_id;

  insert into public.inventory_adjustments (
    product_id,
    distributor_id,
    delta,
    previous_qty,
    new_qty,
    reason,
    note
  )
  values (
    req.product_id,
    req.requesting_distributor_id,
    _approved_qty,
    requester_prev_qty,
    requester_next_qty,
    'restock',
    'Transfer in fulfilling stock request ' || _request_id::text
  );

  update public.stock_transfer_requests
  set status = 'approved',
      approved_qty = _approved_qty,
      fulfilled_by_distributor_id = _fulfilled_by_distributor_id,
      reviewed_by = _reviewed_by,
      reviewed_at = now(),
      admin_note = _admin_note
  where id = _request_id;
end;
$$;
