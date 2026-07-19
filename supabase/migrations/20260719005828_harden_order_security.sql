-- Harden the public Data API around checkout, guest order tracking, and
-- privileged functions. Checkout writes are performed exclusively by the
-- server-side service-role client.

-- ---------------------------------------------------------------------------
-- Guest order bearer tokens
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists guest_access_token_hash text;

comment on column public.orders.guest_access_token_hash is
  'SHA-256 hash of the 256-bit bearer token required to view a guest order.';

-- Existing guest links used only an order number and email. Give every legacy
-- guest order an unrecoverable random token hash so sequential order numbers
-- can no longer be used to access it. Support/admin users can still assist
-- those four legacy orders through authenticated back-office access.
update public.orders
set guest_access_token_hash = encode(
  sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')),
  'hex'
)
where customer_id is null
  and guest_access_token_hash is null;

update public.orders
set guest_access_token_hash = null
where customer_id is not null
  and guest_access_token_hash is not null;

create unique index if not exists orders_guest_access_token_hash_key
  on public.orders (guest_access_token_hash)
  where guest_access_token_hash is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_guest_access_token_rule'
  ) then
    alter table public.orders
      add constraint orders_guest_access_token_rule check (
        (
          customer_id is null
          and (
            guest_access_token_hash is null
            or guest_access_token_hash ~ '^[0-9a-f]{64}$'
          )
        )
        or (
          customer_id is not null
          and guest_access_token_hash is null
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Remove direct checkout writes
-- ---------------------------------------------------------------------------

drop policy if exists "orders insert any" on public.orders;
drop policy if exists "orders guest insert" on public.orders;
drop policy if exists "orders user insert" on public.orders;

drop policy if exists "order_items insert any" on public.order_items;
drop policy if exists "order_items guest insert" on public.order_items;
drop policy if exists "order_items user insert" on public.order_items;

drop policy if exists "addresses insert any" on public.delivery_addresses;
drop policy if exists "addresses guest insert" on public.delivery_addresses;
drop policy if exists "addresses user insert" on public.delivery_addresses;

drop policy if exists "notifications owner insert" on public.notifications;

-- Saved-address management remains available to signed-in owners only.
create policy "addresses user insert"
  on public.delivery_addresses
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and customer_id = (select auth.uid())
    and is_saved = true
  );

drop policy if exists "addresses owner update" on public.delivery_addresses;
create policy "addresses owner update"
  on public.delivery_addresses
  for update
  to authenticated
  using (
    customer_id = (select auth.uid())
    and is_saved = true
  )
  with check (
    customer_id = (select auth.uid())
    and is_saved = true
  );

drop policy if exists "addresses owner delete" on public.delivery_addresses;
create policy "addresses owner delete"
  on public.delivery_addresses
  for delete
  to authenticated
  using (
    customer_id = (select auth.uid())
    and is_saved = true
  );

-- The guest helper existed only to permit direct order-item insertion.
drop function if exists public.is_guest_order(uuid);

-- ---------------------------------------------------------------------------
-- Harden callable functions
-- ---------------------------------------------------------------------------

-- Role checks are invoker-rights and can only inspect the caller's own role.
create or replace function public.has_role(
  _user_id uuid,
  _role public.app_role
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    _user_id = (select auth.uid())
    and exists (
      select 1
      from public.user_roles as role_row
      where role_row.user_id = _user_id
        and role_row.role = _role
    )
$$;

create or replace function public.get_my_distributor_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select role_row.distributor_id
  from public.user_roles as role_row
  where role_row.user_id = (select auth.uid())
    and role_row.role = 'distributor'
    and role_row.distributor_id is not null
  limit 1
$$;

-- Sequence access is an internal server concern, not a public RPC.
create or replace function public.generate_order_number()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sequence_value bigint;
begin
  sequence_value := nextval('public.order_number_seq'::regclass);
  return 'FEA-'
    || pg_catalog.to_char(pg_catalog.now(), 'YYMMDD')
    || '-'
    || pg_catalog.lpad(sequence_value::text, 6, '0');
end;
$$;

-- The replacement accepts only an order ID and derives every security- and
-- accounting-sensitive value from locked database rows. It is invoker-rights
-- and service-role-only.
create function public.redeem_coupon_atomic(_order_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order record;
  target_coupon record;
  existing_redemption record;
  expected_discount integer;
  redemption_count bigint;
begin
  select
    order_row.id,
    order_row.customer_id,
    order_row.coupon_id,
    order_row.discount,
    order_row.subtotal,
    order_row.created_at
  into target_order
  from public.orders as order_row
  where order_row.id = _order_id
  for update;

  if not found
    or target_order.coupon_id is null
    or target_order.discount <= 0
  then
    return false;
  end if;

  select
    coupon_row.id,
    coupon_row.type,
    coupon_row.value,
    coupon_row.min_order_cents,
    coupon_row.max_discount_cents,
    coupon_row.usage_limit,
    coupon_row.per_user_limit,
    coupon_row.used_count,
    coupon_row.starts_at,
    coupon_row.expires_at,
    coupon_row.is_active
  into target_coupon
  from public.coupons as coupon_row
  where coupon_row.id = target_order.coupon_id
  for update;

  if not found or not target_coupon.is_active then
    return false;
  end if;

  select
    redemption.coupon_id,
    redemption.user_id,
    redemption.discount_cents
  into existing_redemption
  from public.coupon_redemptions as redemption
  where redemption.order_id = target_order.id;

  if found then
    return existing_redemption.coupon_id = target_order.coupon_id
      and existing_redemption.user_id is not distinct from target_order.customer_id
      and existing_redemption.discount_cents = target_order.discount;
  end if;

  if target_coupon.starts_at is not null
    and target_order.created_at < target_coupon.starts_at
  then
    return false;
  end if;

  if target_coupon.expires_at is not null
    and target_order.created_at > target_coupon.expires_at
  then
    return false;
  end if;

  if target_order.subtotal < target_coupon.min_order_cents then
    return false;
  end if;

  if target_coupon.usage_limit is not null
    and target_coupon.used_count >= target_coupon.usage_limit
  then
    return false;
  end if;

  if target_order.customer_id is not null
    and target_coupon.per_user_limit is not null
  then
    select count(*)
    into redemption_count
    from public.coupon_redemptions as redemption
    where redemption.coupon_id = target_coupon.id
      and redemption.user_id = target_order.customer_id;

    if redemption_count >= target_coupon.per_user_limit then
      return false;
    end if;
  end if;

  if target_coupon.type = 'percentage' then
    expected_discount := pg_catalog.floor(
      (target_order.subtotal::numeric * target_coupon.value::numeric) / 100
    )::integer;
    if target_coupon.max_discount_cents is not null then
      expected_discount := least(expected_discount, target_coupon.max_discount_cents);
    end if;
  else
    expected_discount := target_coupon.value;
  end if;

  expected_discount := greatest(0, least(expected_discount, target_order.subtotal));
  if expected_discount <= 0 or expected_discount <> target_order.discount then
    return false;
  end if;

  insert into public.coupon_redemptions (
    coupon_id,
    order_id,
    user_id,
    discount_cents
  ) values (
    target_order.coupon_id,
    target_order.id,
    target_order.customer_id,
    target_order.discount
  );

  update public.coupons
  set used_count = used_count + 1
  where id = target_coupon.id;

  return true;
end;
$$;

-- Backward-compatible wrapper for the currently deployed checkout. It accepts
-- the old shape only long enough for a zero-downtime app rollout, rejects any
-- argument that differs from the stored order, and delegates to the hardened
-- one-argument implementation. Neither overload is public.
create or replace function public.redeem_coupon_atomic(
  _coupon_id uuid,
  _order_id uuid,
  _user_id uuid,
  _discount_cents integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order record;
begin
  select
    order_row.coupon_id,
    order_row.customer_id,
    order_row.discount
  into target_order
  from public.orders as order_row
  where order_row.id = _order_id;

  if not found
    or target_order.coupon_id is distinct from _coupon_id
    or target_order.customer_id is distinct from _user_id
    or target_order.discount is distinct from _discount_cents
  then
    return false;
  end if;

  return public.redeem_coupon_atomic(_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Least-privilege Data API surface
-- ---------------------------------------------------------------------------

-- Existing projects historically granted every Data API role every table and
-- function privilege. Reset the public schema to an explicit allowlist.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- Public storefront reads.
grant select on table
  public.categories,
  public.products,
  public.store_settings
to anon, authenticated;

-- Signed-in self-service reads.
grant select on table
  public.profiles,
  public.user_roles,
  public.delivery_addresses,
  public.orders,
  public.order_items,
  public.notifications,
  public.wallet_transactions
to authenticated;

-- Users may manage only saved addresses; RLS supplies the row boundary while
-- column grants prevent ownership/system metadata changes.
grant insert (
  customer_id,
  label,
  full_name,
  email,
  phone,
  line1,
  line2,
  city,
  state,
  zip,
  instructions,
  is_default,
  is_saved
) on public.delivery_addresses to authenticated;

grant update (
  label,
  full_name,
  email,
  phone,
  line1,
  line2,
  city,
  state,
  zip,
  instructions,
  is_default
) on public.delivery_addresses to authenticated;

grant delete on public.delivery_addresses to authenticated;

grant update (full_name, phone) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Only the two identity helpers are part of the authenticated RPC surface.
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.get_my_distributor_id() to authenticated;

-- Trusted server code retains the complete internal surface.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future objects created by repository migrations start closed and must opt in
-- explicitly. Service-role access remains available for server functions.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema public
  grant all privileges on tables to service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Defense in depth: every application table in the exposed public schema must
-- keep RLS enabled even when its direct Data API grants are removed.
alter table public.categories enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.coupons enable row level security;
alter table public.delivery_addresses enable row level security;
alter table public.distributor_inventory enable row level security;
alter table public.distributors enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.notifications enable row level security;
alter table public.order_items enable row level security;
alter table public.orders enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.referral_commissions enable row level security;
alter table public.service_areas enable row level security;
alter table public.stock_transfer_requests enable row level security;
alter table public.store_settings enable row level security;
alter table public.user_roles enable row level security;
alter table public.wallet_transactions enable row level security;

-- Notifications are now protected by owner-only SELECT RLS and can safely be
-- streamed to authenticated subscribers.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

notify pgrst, 'reload schema';
