-- Local distributors need variant-level stock. The central supply hub keeps
-- using product_variants as its authoritative variant inventory; this table
-- stores only local-distributor allocations.
create table if not exists public.distributor_variant_inventory (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  updated_at timestamptz not null default now(),
  unique (distributor_id, variant_id)
);

create index if not exists distributor_variant_inventory_product_idx
  on public.distributor_variant_inventory (distributor_id, product_id);
create index if not exists distributor_variant_inventory_product_fk_idx
  on public.distributor_variant_inventory (product_id);
create index if not exists distributor_variant_inventory_variant_fk_idx
  on public.distributor_variant_inventory (variant_id);

alter table public.distributor_variant_inventory enable row level security;

create policy "distributor variant inventory readable"
  on public.distributor_variant_inventory
  for select
  to authenticated
  using (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    or distributor_id = (select public.get_my_distributor_id())
  );

create policy "distributor variant inventory update"
  on public.distributor_variant_inventory
  for update
  to authenticated
  using (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    or distributor_id = (select public.get_my_distributor_id())
  )
  with check (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
    or distributor_id = (select public.get_my_distributor_id())
  );

create policy "distributor variant inventory admin insert"
  on public.distributor_variant_inventory
  for insert
  to authenticated
  with check ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

create policy "distributor variant inventory admin delete"
  on public.distributor_variant_inventory
  for delete
  to authenticated
  using ((select public.has_role((select auth.uid()), 'admin'::public.app_role)));

alter table public.stock_transfer_requests
  add column if not exists variant_id uuid
    references public.product_variants(id) on delete restrict;

create index if not exists stock_transfer_requests_variant_idx
  on public.stock_transfer_requests (variant_id)
  where variant_id is not null;

create or replace function public.validate_distributor_variant_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = new.variant_id
      and v.product_id = new.product_id
      and p.has_variants
  ) then
    raise exception 'Variant inventory must reference a variant belonging to the product.';
  end if;

  if exists (
    select 1
    from public.distributors d
    where d.id = new.distributor_id
      and d.can_supply
  ) then
    raise exception 'Main Warehouse variant stock is stored on the catalog variant.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_distributor_variant_inventory
  on public.distributor_variant_inventory;
create trigger validate_distributor_variant_inventory
  before insert or update of distributor_id, product_id, variant_id
  on public.distributor_variant_inventory
  for each row
  execute function public.validate_distributor_variant_inventory();

create or replace function public.sync_local_variant_inventory_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_distributor_id uuid;
  target_product_id uuid;
  total_stock integer;
begin
  target_distributor_id := case when tg_op = 'DELETE' then old.distributor_id else new.distributor_id end;
  target_product_id := case when tg_op = 'DELETE' then old.product_id else new.product_id end;

  if exists (
    select 1
    from public.distributors d
    where d.id = target_distributor_id
      and d.can_supply
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select coalesce(sum(inventory.stock_qty), 0)::integer
    into total_stock
    from public.distributor_variant_inventory inventory
    where inventory.distributor_id = target_distributor_id
      and inventory.product_id = target_product_id;

  perform set_config('app.distributor_variant_rollup', 'on', true);
  insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
  values (target_distributor_id, target_product_id, total_stock)
  on conflict (distributor_id, product_id) do update
    set stock_qty = excluded.stock_qty,
        updated_at = now()
    where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;
  perform set_config('app.distributor_variant_rollup', 'off', true);

  if tg_op = 'UPDATE'
     and (
       old.distributor_id is distinct from new.distributor_id
       or old.product_id is distinct from new.product_id
     ) then
    select coalesce(sum(inventory.stock_qty), 0)::integer
      into total_stock
      from public.distributor_variant_inventory inventory
      where inventory.distributor_id = old.distributor_id
        and inventory.product_id = old.product_id;

    perform set_config('app.distributor_variant_rollup', 'on', true);
    insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
    values (old.distributor_id, old.product_id, total_stock)
    on conflict (distributor_id, product_id) do update
      set stock_qty = excluded.stock_qty,
          updated_at = now()
      where public.distributor_inventory.stock_qty is distinct from excluded.stock_qty;
    perform set_config('app.distributor_variant_rollup', 'off', true);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sync_local_variant_inventory_rollup
  on public.distributor_variant_inventory;
create trigger sync_local_variant_inventory_rollup
  after insert or delete or update of distributor_id, product_id, stock_qty
  on public.distributor_variant_inventory
  for each row
  execute function public.sync_local_variant_inventory_rollup();

create or replace function public.protect_variant_distributor_inventory()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.stock_qty is distinct from new.stock_qty
     and coalesce(current_setting('app.distributor_variant_rollup', true), '') <> 'on'
     and exists (
       select 1
       from public.products p
       join public.distributors d on d.id = new.distributor_id
       where p.id = new.product_id
         and p.has_variants
         and not d.can_supply
     ) then
    raise exception 'Stock for a variant product must be changed on its distributor variant rows.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_variant_distributor_inventory on public.distributor_inventory;
create trigger protect_variant_distributor_inventory
  before update of stock_qty on public.distributor_inventory
  for each row
  execute function public.protect_variant_distributor_inventory();

create or replace function public.validate_stock_transfer_variant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_has_variants boolean;
  target_variant_active boolean;
begin
  select p.has_variants
    into target_has_variants
    from public.products p
    where p.id = new.product_id;

  if target_has_variants is null then
    raise exception 'Product not found.';
  end if;

  if target_has_variants and new.variant_id is null then
    raise exception 'Choose a variant when requesting stock for this product.';
  end if;
  if not target_has_variants and new.variant_id is not null then
    raise exception 'This product does not accept a variant stock request.';
  end if;

  if new.variant_id is not null then
    select v.is_active
      into target_variant_active
      from public.product_variants v
      where v.id = new.variant_id
        and v.product_id = new.product_id;
    if target_variant_active is null then
      raise exception 'The selected variant does not belong to this product.';
    end if;
    if tg_op = 'INSERT' and not target_variant_active then
      raise exception 'The selected variant is archived.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_stock_transfer_variant on public.stock_transfer_requests;
create trigger validate_stock_transfer_variant
  before insert or update of product_id, variant_id
  on public.stock_transfer_requests
  for each row
  execute function public.validate_stock_transfer_variant();

-- A Main Warehouse product total is derived from its variants. Direct edits
-- to the mirrored supply-hub row must not bypass that invariant.
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

-- Atomically move either a base product or one exact variant from Main
-- Warehouse to the requesting local distributor.
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
set search_path = ''
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

  if not found then raise exception 'Stock transfer request not found.'; end if;
  if req.status <> 'pending' then raise exception 'This request has already been reviewed.'; end if;
  if _approved_qty <= 0 then raise exception 'Approved quantity must be greater than zero.'; end if;
  if _approved_qty > req.requested_qty then
    raise exception 'Approved quantity cannot exceed the requested quantity.';
  end if;
  if req.requesting_distributor_id = _fulfilled_by_distributor_id then
    raise exception 'The source and requesting distributor must be different.';
  end if;
  if not exists (
    select 1
    from public.distributors d
    where d.id = _fulfilled_by_distributor_id
      and d.is_active
      and d.can_supply
  ) then
    raise exception 'Choose the active Main Warehouse as the supply source.';
  end if;

  if req.variant_id is not null then
    select v.stock_qty
      into supplier_prev_qty
      from public.product_variants v
      where v.id = req.variant_id
        and v.product_id = req.product_id
        and v.is_active
      for update;
    if supplier_prev_qty is null then raise exception 'The requested variant is unavailable.'; end if;
    if supplier_prev_qty < _approved_qty then
      raise exception 'Main Warehouse only has % units of this variant in stock.', supplier_prev_qty;
    end if;

    supplier_next_qty := supplier_prev_qty - _approved_qty;
    update public.product_variants
      set stock_qty = supplier_next_qty
      where id = req.variant_id;

    insert into public.distributor_variant_inventory (
      distributor_id, product_id, variant_id, stock_qty
    ) values (
      req.requesting_distributor_id, req.product_id, req.variant_id, 0
    ) on conflict (distributor_id, variant_id) do nothing;

    select inventory.stock_qty
      into requester_prev_qty
      from public.distributor_variant_inventory inventory
      where inventory.distributor_id = req.requesting_distributor_id
        and inventory.variant_id = req.variant_id
      for update;

    requester_next_qty := requester_prev_qty + _approved_qty;
    update public.distributor_variant_inventory
      set stock_qty = requester_next_qty,
          updated_at = now()
      where distributor_id = req.requesting_distributor_id
        and variant_id = req.variant_id;

    insert into public.inventory_adjustments (
      product_id, variant_id, distributor_id, delta, previous_qty, new_qty, reason, note
    ) values
      (
        req.product_id, req.variant_id, _fulfilled_by_distributor_id,
        -_approved_qty, supplier_prev_qty, supplier_next_qty, 'correction',
        'Variant transfer out for request ' || _request_id::text
      ),
      (
        req.product_id, req.variant_id, req.requesting_distributor_id,
        _approved_qty, requester_prev_qty, requester_next_qty, 'restock',
        'Variant transfer in for request ' || _request_id::text
      );
  else
    select inventory.stock_qty
      into supplier_prev_qty
      from public.distributor_inventory inventory
      where inventory.distributor_id = _fulfilled_by_distributor_id
        and inventory.product_id = req.product_id
      for update;
    if supplier_prev_qty is null then
      raise exception 'Main Warehouse has no recorded stock for this product.';
    end if;
    if supplier_prev_qty < _approved_qty then
      raise exception 'Main Warehouse only has % units in stock.', supplier_prev_qty;
    end if;

    supplier_next_qty := supplier_prev_qty - _approved_qty;
    update public.distributor_inventory
      set stock_qty = supplier_next_qty
      where distributor_id = _fulfilled_by_distributor_id
        and product_id = req.product_id;

    insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
    values (req.requesting_distributor_id, req.product_id, 0)
    on conflict (distributor_id, product_id) do nothing;

    select inventory.stock_qty
      into requester_prev_qty
      from public.distributor_inventory inventory
      where inventory.distributor_id = req.requesting_distributor_id
        and inventory.product_id = req.product_id
      for update;

    requester_next_qty := requester_prev_qty + _approved_qty;
    update public.distributor_inventory
      set stock_qty = requester_next_qty
      where distributor_id = req.requesting_distributor_id
        and product_id = req.product_id;

    insert into public.inventory_adjustments (
      product_id, distributor_id, delta, previous_qty, new_qty, reason, note
    ) values
      (
        req.product_id, _fulfilled_by_distributor_id, -_approved_qty,
        supplier_prev_qty, supplier_next_qty, 'correction',
        'Transfer out for request ' || _request_id::text
      ),
      (
        req.product_id, req.requesting_distributor_id, _approved_qty,
        requester_prev_qty, requester_next_qty, 'restock',
        'Transfer in for request ' || _request_id::text
      );
  end if;

  update public.stock_transfer_requests
    set status = 'approved',
        approved_qty = _approved_qty,
        fulfilled_by_distributor_id = _fulfilled_by_distributor_id,
        reviewed_by = _reviewed_by,
        reviewed_at = now(),
        admin_note = nullif(trim(coalesce(_admin_note, '')), ''),
        updated_at = now()
    where id = _request_id;
end;
$$;

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
  if cardinality(_request_ids) <> (
    select count(distinct value)
    from unnest(_request_ids) request_ids(value)
  ) then
    raise exception 'Duplicate stock request IDs are not allowed.';
  end if;
  if not exists (
    select 1
    from public.distributors d
    where d.id = _fulfilled_by_distributor_id
      and d.is_active
      and d.can_supply
  ) then
    raise exception 'Choose the active Main Warehouse as the supply source.';
  end if;

  for current_request_id, current_requested_qty in
    select request.id, request.requested_qty
    from public.stock_transfer_requests request
    where request.id = any(_request_ids)
      and request.status = 'pending'
    order by request.product_id, request.variant_id nulls first, request.id
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

-- Reserve from exactly the warehouse and variant assigned to the order.
create or replace function public.record_order_stock_decrement(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order record;
  line record;
  previous_qty integer;
  next_qty integer;
  target_is_supply_hub boolean;
begin
  select o.id, o.distributor_id, o.order_status, o.payment_status,
         o.inventory_reserved_at, o.inventory_released_at
    into target_order
    from public.orders o
    where o.id = _order_id
    for update;

  if not found then raise exception 'Order not found.'; end if;
  if target_order.inventory_reserved_at is not null then return; end if;
  if target_order.inventory_released_at is not null
     or target_order.order_status::text in ('cancelled', 'refunded')
     or target_order.payment_status::text in ('failed', 'refunded') then
    raise exception 'Inventory cannot be reserved for a cancelled or failed order.';
  end if;

  select d.can_supply
    into target_is_supply_hub
    from public.distributors d
    where d.id = target_order.distributor_id
      and d.is_active;
  if not found then raise exception 'The assigned warehouse is unavailable.'; end if;

  for line in
    select oi.product_id, oi.variant_id, max(oi.variant_label) variant_label,
           sum(oi.ordered_qty)::integer ordered_qty
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    if line.variant_id is not null then
      if not exists (
        select 1
        from public.product_variants v
        where v.id = line.variant_id
          and v.product_id = line.product_id
          and v.is_active
      ) then
        raise exception 'The selected variant is unavailable.';
      end if;

      if target_is_supply_hub then
        select v.stock_qty
          into previous_qty
          from public.product_variants v
          where v.id = line.variant_id
          for update;
        if previous_qty < line.ordered_qty then
          raise exception 'Only % unit(s) of % remain in Main Warehouse.',
            previous_qty, coalesce(line.variant_label, 'the selected variant');
        end if;
        next_qty := previous_qty - line.ordered_qty;
        update public.product_variants
          set stock_qty = next_qty
          where id = line.variant_id;
      else
        select inventory.stock_qty
          into previous_qty
          from public.distributor_variant_inventory inventory
          where inventory.distributor_id = target_order.distributor_id
            and inventory.variant_id = line.variant_id
          for update;
        if previous_qty is null then
          raise exception 'This variant is not stocked by the assigned distributor.';
        end if;
        if previous_qty < line.ordered_qty then
          raise exception 'The assigned distributor only has % unit(s) of %.',
            previous_qty, coalesce(line.variant_label, 'the selected variant');
        end if;
        next_qty := previous_qty - line.ordered_qty;
        update public.distributor_variant_inventory
          set stock_qty = next_qty,
              updated_at = now()
          where distributor_id = target_order.distributor_id
            and variant_id = line.variant_id;
      end if;

      insert into public.inventory_adjustments (
        product_id, variant_id, distributor_id, delta, previous_qty, new_qty, reason, note
      ) values (
        line.product_id, line.variant_id, target_order.distributor_id,
        -line.ordered_qty, previous_qty, next_qty, 'order',
        'Reserved for order ' || _order_id::text
      );
    else
      if exists (
        select 1 from public.products p
        where p.id = line.product_id and p.has_variants
      ) then
        raise exception 'Select a variant before ordering this product.';
      end if;

      select inventory.stock_qty
        into previous_qty
        from public.distributor_inventory inventory
        where inventory.distributor_id = target_order.distributor_id
          and inventory.product_id = line.product_id
        for update;
      if previous_qty is null then
        raise exception 'This product is not stocked by the assigned warehouse.';
      end if;
      if previous_qty < line.ordered_qty then
        raise exception 'The assigned warehouse has only % unit(s) available.', previous_qty;
      end if;

      next_qty := previous_qty - line.ordered_qty;
      update public.distributor_inventory
        set stock_qty = next_qty,
            updated_at = now()
        where distributor_id = target_order.distributor_id
          and product_id = line.product_id;

      insert into public.inventory_adjustments (
        product_id, distributor_id, delta, previous_qty, new_qty, reason, note
      ) values (
        line.product_id, target_order.distributor_id, -line.ordered_qty,
        previous_qty, next_qty, 'order', 'Reserved for order ' || _order_id::text
      );
    end if;
  end loop;

  update public.orders
    set inventory_reserved_at = now()
    where id = _order_id;
end;
$$;

create or replace function public.restore_order_inventory_rows(
  _order_id uuid,
  _distributor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  line record;
  previous_qty integer;
  next_qty integer;
  target_is_supply_hub boolean;
begin
  select d.can_supply
    into target_is_supply_hub
    from public.distributors d
    where d.id = _distributor_id;

  for line in
    select oi.product_id, oi.variant_id, sum(oi.ordered_qty)::integer ordered_qty
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    if line.variant_id is not null then
      if target_is_supply_hub then
        select v.stock_qty into previous_qty
        from public.product_variants v
        where v.id = line.variant_id
        for update;
        next_qty := previous_qty + line.ordered_qty;
        update public.product_variants
          set stock_qty = next_qty
          where id = line.variant_id;
      else
        select inventory.stock_qty into previous_qty
        from public.distributor_variant_inventory inventory
        where inventory.distributor_id = _distributor_id
          and inventory.variant_id = line.variant_id
        for update;
        if previous_qty is null then
          raise exception 'Reserved distributor variant inventory is missing.';
        end if;
        next_qty := previous_qty + line.ordered_qty;
        update public.distributor_variant_inventory
          set stock_qty = next_qty,
              updated_at = now()
          where distributor_id = _distributor_id
            and variant_id = line.variant_id;
      end if;
    else
      select inventory.stock_qty into previous_qty
      from public.distributor_inventory inventory
      where inventory.distributor_id = _distributor_id
        and inventory.product_id = line.product_id
      for update;
      if previous_qty is null then
        raise exception 'Reserved distributor inventory is missing.';
      end if;
      next_qty := previous_qty + line.ordered_qty;
      update public.distributor_inventory
        set stock_qty = next_qty,
            updated_at = now()
        where distributor_id = _distributor_id
          and product_id = line.product_id;
    end if;

    insert into public.inventory_adjustments (
      product_id, variant_id, distributor_id, delta, previous_qty, new_qty, reason, note
    ) values (
      line.product_id, line.variant_id, _distributor_id, line.ordered_qty,
      previous_qty, next_qty, 'return',
      'Released for cancelled or failed order ' || _order_id::text
    );
  end loop;
end;
$$;

revoke all on table public.distributor_variant_inventory from anon;
grant select, update on table public.distributor_variant_inventory to authenticated;
grant all on table public.distributor_variant_inventory to service_role;

revoke all on function public.validate_distributor_variant_inventory() from public;
revoke all on function public.sync_local_variant_inventory_rollup() from public;
revoke all on function public.protect_variant_distributor_inventory() from public;
revoke all on function public.validate_stock_transfer_variant() from public;
revoke all on function public.sync_product_stock_to_supply_hub() from public;

revoke all on function public.approve_stock_transfer(uuid, integer, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_stock_transfer(uuid, integer, uuid, uuid, text)
  to service_role;

revoke all on function public.approve_stock_transfers_bulk(uuid[], uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.approve_stock_transfers_bulk(uuid[], uuid, uuid, text)
  to service_role;

revoke all on function public.record_order_stock_decrement(uuid)
  from public, anon, authenticated;
grant execute on function public.record_order_stock_decrement(uuid)
  to service_role;

revoke all on function public.restore_order_inventory_rows(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.restore_order_inventory_rows(uuid, uuid)
  to service_role;
