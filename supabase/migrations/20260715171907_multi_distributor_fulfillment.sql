-- Distributors: regional fulfillment centers. Shared catalog, regional stock.
create table public.distributors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_phone text,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_distributors_updated_at
  before update on public.distributors
  for each row execute function public.update_updated_at_column();

-- Scope distributor-role users to exactly one distributor. The existing
-- unique(user_id, role) constraint on user_roles already prevents a user
-- from holding the 'distributor' role twice (i.e. for two distributors).
alter table public.user_roles
  add column distributor_id uuid references public.distributors(id) on delete set null;

alter table public.user_roles
  add constraint user_roles_distributor_role_requires_id
  check (role <> 'distributor' or distributor_id is not null);

create or replace function public.get_my_distributor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select distributor_id from public.user_roles
  where user_id = auth.uid() and role = 'distributor' and distributor_id is not null
  limit 1
$$;

alter table public.distributors enable row level security;

create policy "distributors admin write" on public.distributors
  for all using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "distributors self read" on public.distributors
  for select using (id = public.get_my_distributor_id());

-- Service areas: pincode -> distributor. Non-overlapping coverage (one
-- distributor per pincode), matching "each area has its own distributor".
-- Resolution happens server-side via the service-role client, so no public
-- or distributor-scoped read policy is needed here.
create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  pincode text not null unique check (pincode ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now()
);

alter table public.service_areas enable row level security;

create policy "service areas admin write" on public.service_areas
  for all using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

-- Distributor inventory: per-distributor stock for the shared product
-- catalog. This is the fulfillment-level stock ledger; products.stock_qty
-- remains untouched as the global/reference figure used by the storefront
-- and admin catalog.
create table public.distributor_inventory (
  id uuid primary key default gen_random_uuid(),
  distributor_id uuid not null references public.distributors(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  updated_at timestamptz not null default now(),
  unique (distributor_id, product_id)
);

create trigger set_distributor_inventory_updated_at
  before update on public.distributor_inventory
  for each row execute function public.update_updated_at_column();

alter table public.distributor_inventory enable row level security;

create policy "distributor inventory admin write" on public.distributor_inventory
  for all using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "distributor inventory self read" on public.distributor_inventory
  for select using (distributor_id = public.get_my_distributor_id());

create policy "distributor inventory self write" on public.distributor_inventory
  for update using (distributor_id = public.get_my_distributor_id())
  with check (distributor_id = public.get_my_distributor_id());

-- Extend the existing inventory ledger with an optional distributor
-- dimension (null = legacy/global adjustment, set = distributor-scoped).
alter table public.inventory_adjustments
  add column distributor_id uuid references public.distributors(id) on delete set null;

create policy "inventory adjustments distributor read" on public.inventory_adjustments
  for select using (distributor_id = public.get_my_distributor_id());

create policy "inventory adjustments distributor insert" on public.inventory_adjustments
  for insert with check (distributor_id = public.get_my_distributor_id());

-- Orders: every order snapshots the distributor that fulfills it, resolved
-- once at checkout and never recomputed.
alter table public.orders
  add column distributor_id uuid references public.distributors(id);

create policy "orders distributor read" on public.orders
  for select using (distributor_id = public.get_my_distributor_id());

create policy "orders distributor update" on public.orders
  for update using (distributor_id = public.get_my_distributor_id())
  with check (distributor_id = public.get_my_distributor_id());

create policy "order_items distributor read" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.distributor_id = public.get_my_distributor_id()
    )
  );

create policy "order_items distributor update" on public.order_items
  for update using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.distributor_id = public.get_my_distributor_id()
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.distributor_id = public.get_my_distributor_id()
    )
  );

-- Extend the stock-decrement RPC (called once per order from placeOrder) to
-- ALSO decrement the resolved distributor's inventory. The existing global
-- products.stock_qty decrement + ledger entry is left completely unchanged;
-- this only appends a second, distributor-scoped decrement + ledger entry.
create or replace function public.record_order_stock_decrement(_order_id uuid)
returns void
language plpgsql
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

-- Backfill: seed a "Main Distributor" representing current operations so
-- existing orders and checkout keep working without interruption, then
-- point every existing order, every product's current stock, and every
-- currently-used pincode at it.
do $$
declare
  main_id uuid;
begin
  insert into public.distributors (name, contact_phone, is_active)
  values ('FEABazaar — Main Warehouse', null, true)
  returning id into main_id;

  insert into public.distributor_inventory (distributor_id, product_id, stock_qty)
  select main_id, id, stock_qty from public.products
  on conflict (distributor_id, product_id) do nothing;

  insert into public.service_areas (distributor_id, pincode)
  select main_id, z.zip
  from (select distinct zip from public.delivery_addresses where zip ~ '^[0-9]{6}$') as z
  on conflict (pincode) do nothing;

  update public.orders set distributor_id = main_id where distributor_id is null;
end $$;

-- Every order must resolve to a distributor going forward; placeOrder must
-- reject checkout before insert if no distributor covers the address.
alter table public.orders alter column distributor_id set not null;
