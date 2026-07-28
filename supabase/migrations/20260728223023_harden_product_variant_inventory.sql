-- Product variants are inventory-bearing records. Keep their identifiers,
-- stock, and order snapshots durable, and make reservation concurrency-safe.

alter table public.product_variants
  add column if not exists low_stock_threshold integer not null default 10;

alter table public.order_items
  add column if not exists variant_sku text;

alter table public.orders
  add column if not exists inventory_reserved_at timestamptz,
  add column if not exists inventory_released_at timestamptz;

alter table public.inventory_adjustments
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

create index if not exists inventory_adjustments_variant_idx
  on public.inventory_adjustments (variant_id, created_at desc)
  where variant_id is not null;

-- Existing variant rows predate SKU support in the admin UI. Give them stable,
-- deterministic SKUs before making the column mandatory.
update public.product_variants pv
set sku = upper(
  trim(
    both '-'
    from regexp_replace(p.slug || '-' || pv.option_value, '[^a-zA-Z0-9]+', '-', 'g')
  )
)
from public.products p
where p.id = pv.product_id
  and nullif(trim(pv.sku), '') is null;

alter table public.product_variants
  alter column sku set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_sku_not_blank'
  ) then
    alter table public.product_variants
      add constraint product_variants_sku_not_blank check (length(trim(sku)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_option_name_not_blank'
  ) then
    alter table public.product_variants
      add constraint product_variants_option_name_not_blank check (length(trim(option_name)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_option_value_not_blank'
  ) then
    alter table public.product_variants
      add constraint product_variants_option_value_not_blank check (length(trim(option_value)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_low_stock_threshold_check'
  ) then
    alter table public.product_variants
      add constraint product_variants_low_stock_threshold_check
      check (low_stock_threshold >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.product_variants'::regclass
      and conname = 'product_variants_mrp_gte_price'
  ) then
    alter table public.product_variants
      add constraint product_variants_mrp_gte_price
      check (mrp_cents is null or mrp_cents >= price_cents);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_stock_qty_check'
  ) then
    alter table public.products
      add constraint products_stock_qty_check check (stock_qty >= 0);
  end if;
end;
$$;

create unique index if not exists product_variants_sku_unique_ci
  on public.product_variants (lower(trim(sku)));

create unique index if not exists product_variants_option_unique_ci
  on public.product_variants (
    product_id,
    lower(trim(option_name)),
    lower(trim(option_value))
  );

-- Parent product stock is the total sellable stock across active variants.
-- Its list price is the lowest active variant price.
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

drop trigger if exists sync_variant_product_rollup on public.product_variants;
create trigger sync_variant_product_rollup
  after insert or delete or update of product_id, price_cents, stock_qty, is_active
  on public.product_variants
  for each row
  execute function public.sync_variant_product_rollup();

create or replace function public.protect_variant_product_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.has_variants
     and new.has_variants
     and old.stock_qty is distinct from new.stock_qty
     and coalesce(current_setting('app.variant_rollup', true), '') <> 'on' then
    raise exception 'Stock for a product with variants must be changed on its variant rows.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_variant_product_stock on public.products;
create trigger protect_variant_product_stock
  before update of stock_qty on public.products
  for each row
  execute function public.protect_variant_product_stock();

-- One RPC owns the product and variant write transaction. A duplicate SKU,
-- duplicate option, or invalid variant id rolls the entire save back.
create or replace function public.admin_upsert_product(
  _product_id uuid,
  _name text,
  _slug text,
  _description text,
  _category_id uuid,
  _price_cents integer,
  _mrp_cents integer,
  _brand text,
  _unit_label text,
  _image_url text,
  _stock_qty integer,
  _is_active boolean,
  _is_featured boolean,
  _tags text[],
  _has_variants boolean,
  _variants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_product_id uuid;
  variant jsonb;
  target_variant_id uuid;
  submitted_ids uuid[] := '{}'::uuid[];
  normalized_option_name text;
  normalized_option_value text;
  normalized_sku text;
  variant_price integer;
  variant_mrp integer;
  variant_stock integer;
  variant_threshold integer;
  variant_active boolean;
  variant_sort integer;
begin
  if nullif(trim(_name), '') is null then
    raise exception 'Product name is required.';
  end if;
  if nullif(trim(_slug), '') is null then
    raise exception 'Product slug is required.';
  end if;
  if nullif(trim(_unit_label), '') is null then
    raise exception 'Product unit is required.';
  end if;
  if _price_cents < 0 or _stock_qty < 0 then
    raise exception 'Price and stock cannot be negative.';
  end if;
  if _mrp_cents is not null and _mrp_cents < _price_cents then
    raise exception 'MRP cannot be lower than the selling price.';
  end if;
  if jsonb_typeof(coalesce(_variants, '[]'::jsonb)) <> 'array' then
    raise exception 'Variants must be an array.';
  end if;
  if _has_variants and jsonb_array_length(coalesce(_variants, '[]'::jsonb)) = 0 then
    raise exception 'Add at least one variant.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(_variants, '[]'::jsonb)) item
    group by lower(trim(item->>'sku'))
    having count(*) > 1
  ) then
    raise exception 'Each variant must have a unique SKU.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(_variants, '[]'::jsonb)) item
    group by lower(trim(coalesce(item->>'option_name', 'Weight'))),
             lower(trim(item->>'option_value'))
    having count(*) > 1
  ) then
    raise exception 'Each variant option must be unique within the product.';
  end if;

  if _product_id is null then
    insert into public.products (
      name,
      slug,
      description,
      category_id,
      price_cents,
      mrp_cents,
      brand,
      unit_label,
      image_url,
      stock_qty,
      is_active,
      is_featured,
      tags,
      has_variants
    ) values (
      trim(_name),
      trim(_slug),
      nullif(trim(_description), ''),
      _category_id,
      _price_cents,
      _mrp_cents,
      nullif(trim(_brand), ''),
      trim(_unit_label),
      nullif(trim(_image_url), ''),
      _stock_qty,
      _is_active,
      _is_featured,
      coalesce(_tags, '{}'::text[]),
      _has_variants
    )
    returning id into target_product_id;
  else
    update public.products
      set name = trim(_name),
          slug = trim(_slug),
          description = nullif(trim(_description), ''),
          category_id = _category_id,
          price_cents = case when _has_variants then price_cents else _price_cents end,
          mrp_cents = case when _has_variants then mrp_cents else _mrp_cents end,
          brand = nullif(trim(_brand), ''),
          unit_label = trim(_unit_label),
          image_url = nullif(trim(_image_url), ''),
          stock_qty = case when _has_variants then stock_qty else _stock_qty end,
          is_active = _is_active,
          is_featured = _is_featured,
          tags = coalesce(_tags, '{}'::text[]),
          has_variants = _has_variants,
          updated_at = now()
      where id = _product_id
      returning id into target_product_id;

    if target_product_id is null then
      raise exception 'Product not found.';
    end if;
  end if;

  if _has_variants then
    for variant in
      select value
      from jsonb_array_elements(coalesce(_variants, '[]'::jsonb))
    loop
      target_variant_id := nullif(variant->>'id', '')::uuid;
      normalized_option_name := trim(coalesce(nullif(variant->>'option_name', ''), 'Weight'));
      normalized_option_value := trim(coalesce(variant->>'option_value', ''));
      normalized_sku := upper(trim(coalesce(variant->>'sku', '')));
      variant_price := coalesce((variant->>'price_cents')::integer, 0);
      variant_mrp := nullif(variant->>'mrp_cents', '')::integer;
      variant_stock := coalesce((variant->>'stock_qty')::integer, 0);
      variant_threshold := coalesce((variant->>'low_stock_threshold')::integer, 10);
      variant_active := coalesce((variant->>'is_active')::boolean, true);
      variant_sort := coalesce((variant->>'sort_order')::integer, 0);

      if normalized_option_value = '' then
        raise exception 'Every variant needs an option value.';
      end if;
      if normalized_sku = '' then
        raise exception 'Every variant needs a SKU.';
      end if;
      if variant_price < 0 or variant_stock < 0 or variant_threshold < 0 then
        raise exception 'Variant price, stock, and low-stock threshold cannot be negative.';
      end if;
      if variant_mrp is not null and variant_mrp < variant_price then
        raise exception 'Variant MRP cannot be lower than its selling price.';
      end if;

      if target_variant_id is null then
        insert into public.product_variants (
          product_id,
          option_name,
          option_value,
          sku,
          price_cents,
          mrp_cents,
          stock_qty,
          low_stock_threshold,
          image_url,
          is_active,
          sort_order
        ) values (
          target_product_id,
          normalized_option_name,
          normalized_option_value,
          normalized_sku,
          variant_price,
          variant_mrp,
          variant_stock,
          variant_threshold,
          nullif(trim(variant->>'image_url'), ''),
          variant_active,
          variant_sort
        )
        returning id into target_variant_id;
      else
        update public.product_variants
          set option_name = normalized_option_name,
              option_value = normalized_option_value,
              sku = normalized_sku,
              price_cents = variant_price,
              mrp_cents = variant_mrp,
              stock_qty = variant_stock,
              low_stock_threshold = variant_threshold,
              image_url = nullif(trim(variant->>'image_url'), ''),
              is_active = variant_active,
              sort_order = variant_sort
          where id = target_variant_id
            and product_id = target_product_id;

        if not found then
          raise exception 'A variant does not belong to this product.';
        end if;
      end if;

      submitted_ids := array_append(submitted_ids, target_variant_id);
    end loop;

    update public.product_variants
      set is_active = false
      where product_id = target_product_id
        and not (id = any(submitted_ids))
        and is_active;
  else
    update public.product_variants
      set is_active = false
      where product_id = target_product_id
        and is_active;
  end if;

  return target_product_id;
end;
$$;

-- Reserve all lines in one transaction. Row locks and exact availability
-- checks prevent concurrent orders from overselling a variant or warehouse.
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
  select o.id,
         o.distributor_id,
         o.order_status,
         o.payment_status,
         o.inventory_reserved_at,
         o.inventory_released_at
    into target_order
    from public.orders o
    where o.id = _order_id
    for update;

  if not found then
    raise exception 'Order not found.';
  end if;
  if target_order.inventory_reserved_at is not null then
    return;
  end if;
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
  if not found then
    raise exception 'The assigned warehouse is unavailable.';
  end if;

  -- Stable lock order avoids deadlocks when two carts contain the same rows.
  perform 1
  from public.product_variants v
  join (
    select oi.variant_id
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.variant_id is not null
    group by oi.variant_id
  ) requested on requested.variant_id = v.id
  order by v.id
  for update of v;

  perform 1
  from public.distributor_inventory inventory
  join (
    select oi.product_id
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.product_id is not null
    group by oi.product_id
  ) requested on requested.product_id = inventory.product_id
  where inventory.distributor_id = target_order.distributor_id
  order by inventory.id
  for update of inventory;

  for line in
    select oi.product_id,
           oi.variant_id,
           max(oi.variant_label) as variant_label,
           sum(oi.ordered_qty)::integer as ordered_qty
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    if line.variant_id is not null then
      select v.stock_qty
        into previous_qty
        from public.product_variants v
        where v.id = line.variant_id
          and v.product_id = line.product_id
          and v.is_active;

      if previous_qty is null then
        raise exception 'The selected variant is unavailable.';
      end if;
      if previous_qty < line.ordered_qty then
        raise exception 'Only % unit(s) of % remain in stock.',
          previous_qty,
          coalesce(line.variant_label, 'the selected variant');
      end if;

      if target_is_supply_hub then
        select p.stock_qty
          into previous_qty
          from public.products p
          where p.id = line.product_id;
      else
        select inventory.stock_qty
          into previous_qty
          from public.distributor_inventory inventory
          where inventory.distributor_id = target_order.distributor_id
            and inventory.product_id = line.product_id;
        if previous_qty is null then
          raise exception 'This product is not stocked by the assigned warehouse.';
        end if;
        if previous_qty < line.ordered_qty then
          raise exception 'The assigned warehouse has only % unit(s) available.', previous_qty;
        end if;
      end if;

      update public.product_variants
        set stock_qty = stock_qty - line.ordered_qty
        where id = line.variant_id;

      if target_is_supply_hub then
        select p.stock_qty
          into next_qty
          from public.products p
          where p.id = line.product_id;
      else
        update public.distributor_inventory
          set stock_qty = stock_qty - line.ordered_qty,
              updated_at = now()
          where distributor_id = target_order.distributor_id
            and product_id = line.product_id
        returning stock_qty into next_qty;
      end if;

      insert into public.inventory_adjustments (
        product_id,
        variant_id,
        distributor_id,
        delta,
        previous_qty,
        new_qty,
        reason,
        note
      ) values (
        line.product_id,
        line.variant_id,
        target_order.distributor_id,
        -line.ordered_qty,
        previous_qty,
        next_qty,
        'order',
        'Reserved for order ' || _order_id::text
      );
    else
      if exists (
        select 1
        from public.products p
        where p.id = line.product_id
          and p.has_variants
      ) then
        raise exception 'Select a variant before ordering this product.';
      end if;

      select inventory.stock_qty
        into previous_qty
        from public.distributor_inventory inventory
        where inventory.distributor_id = target_order.distributor_id
          and inventory.product_id = line.product_id;
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
        product_id,
        distributor_id,
        delta,
        previous_qty,
        new_qty,
        reason,
        note
      ) values (
        line.product_id,
        target_order.distributor_id,
        -line.ordered_qty,
        previous_qty,
        next_qty,
        'order',
        'Reserved for order ' || _order_id::text
      );
    end if;
  end loop;

  update public.orders
    set inventory_reserved_at = now()
    where id = _order_id;
end;
$$;

-- Compatibility for the short deployment window where an older frontend may
-- still call the former second decrement RPC. The main reservation is
-- idempotent, so this cannot decrement twice.
create or replace function public.record_order_variant_stock_decrement(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_order_stock_decrement(_order_id);
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
    select oi.product_id,
           oi.variant_id,
           sum(oi.ordered_qty)::integer as ordered_qty
    from public.order_items oi
    where oi.order_id = _order_id
      and oi.product_id is not null
    group by oi.product_id, oi.variant_id
    order by oi.product_id, oi.variant_id nulls first
  loop
    if line.variant_id is not null then
      if target_is_supply_hub then
        select p.stock_qty into previous_qty
        from public.products p
        where p.id = line.product_id;
      else
        select inventory.stock_qty into previous_qty
        from public.distributor_inventory inventory
        where inventory.distributor_id = _distributor_id
          and inventory.product_id = line.product_id
        for update;
      end if;

      update public.product_variants
        set stock_qty = stock_qty + line.ordered_qty
        where id = line.variant_id;

      if target_is_supply_hub then
        select p.stock_qty into next_qty
        from public.products p
        where p.id = line.product_id;
      else
        update public.distributor_inventory
          set stock_qty = stock_qty + line.ordered_qty,
              updated_at = now()
          where distributor_id = _distributor_id
            and product_id = line.product_id
        returning stock_qty into next_qty;
      end if;
    else
      select inventory.stock_qty into previous_qty
      from public.distributor_inventory inventory
      where inventory.distributor_id = _distributor_id
        and inventory.product_id = line.product_id
      for update;

      update public.distributor_inventory
        set stock_qty = stock_qty + line.ordered_qty,
            updated_at = now()
        where distributor_id = _distributor_id
          and product_id = line.product_id
      returning stock_qty into next_qty;
    end if;

    if previous_qty is not null and next_qty is not null then
      insert into public.inventory_adjustments (
        product_id,
        variant_id,
        distributor_id,
        delta,
        previous_qty,
        new_qty,
        reason,
        note
      ) values (
        line.product_id,
        line.variant_id,
        _distributor_id,
        line.ordered_qty,
        previous_qty,
        next_qty,
        'return',
        'Released for cancelled or failed order ' || _order_id::text
      );
    end if;
  end loop;
end;
$$;

create or replace function public.release_order_inventory(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order record;
begin
  select o.id,
         o.distributor_id,
         o.inventory_reserved_at,
         o.inventory_released_at
    into target_order
    from public.orders o
    where o.id = _order_id
    for update;

  if not found
     or target_order.inventory_reserved_at is null
     or target_order.inventory_released_at is not null then
    return;
  end if;

  perform public.restore_order_inventory_rows(_order_id, target_order.distributor_id);

  update public.orders
    set inventory_released_at = now()
    where id = _order_id;
end;
$$;

create or replace function public.restore_inventory_on_terminal_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.inventory_reserved_at is not null
     and old.inventory_released_at is null
     and (
       new.order_status::text in ('cancelled', 'refunded')
       or new.payment_status::text in ('failed', 'refunded')
     ) then
    perform public.restore_order_inventory_rows(old.id, old.distributor_id);
    new.inventory_released_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists restore_inventory_on_terminal_order on public.orders;
create trigger restore_inventory_on_terminal_order
  before update of order_status, payment_status on public.orders
  for each row
  execute function public.restore_inventory_on_terminal_order();

-- Reconcile old parent rows now that variants are authoritative.
select set_config('app.variant_rollup', 'on', true);

update public.products p
set stock_qty = rollup.stock_qty,
    price_cents = coalesce(rollup.lowest_price, p.price_cents),
    mrp_cents = case
      when rollup.lowest_price is not null and p.mrp_cents < rollup.lowest_price then null
      else p.mrp_cents
    end
from (
  select product_id,
         coalesce(sum(stock_qty) filter (where is_active), 0)::integer as stock_qty,
         min(price_cents) filter (where is_active) as lowest_price
  from public.product_variants
  group by product_id
) rollup
where p.id = rollup.product_id
  and p.has_variants;

select set_config('app.variant_rollup', 'off', true);

revoke all on function public.sync_variant_product_rollup() from public;
revoke all on function public.protect_variant_product_stock() from public;
revoke all on function public.admin_upsert_product(
  uuid, text, text, text, uuid, integer, integer, text, text, text,
  integer, boolean, boolean, text[], boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.admin_upsert_product(
  uuid, text, text, text, uuid, integer, integer, text, text, text,
  integer, boolean, boolean, text[], boolean, jsonb
) to service_role;

revoke all on function public.record_order_stock_decrement(uuid)
  from public, anon, authenticated;
grant execute on function public.record_order_stock_decrement(uuid)
  to service_role;

revoke all on function public.record_order_variant_stock_decrement(uuid)
  from public, anon, authenticated;
grant execute on function public.record_order_variant_stock_decrement(uuid)
  to service_role;

revoke all on function public.restore_order_inventory_rows(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.release_order_inventory(uuid)
  from public, anon, authenticated;
grant execute on function public.release_order_inventory(uuid)
  to service_role;
revoke all on function public.restore_inventory_on_terminal_order()
  from public;
