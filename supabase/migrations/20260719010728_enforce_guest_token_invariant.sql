-- Maintain the guest-token invariant during the zero-downtime rollout. An old
-- server build that omits the token hash still receives an unrecoverable hash,
-- so the insert succeeds without leaving a sequentially enumerable order.
create or replace function public.ensure_guest_order_access_token_hash()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.customer_id is null and new.guest_access_token_hash is null then
    new.guest_access_token_hash := encode(
      sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')),
      'hex'
    );
  elsif new.customer_id is not null then
    new.guest_access_token_hash := null;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_guest_order_access_token_hash on public.orders;
create trigger ensure_guest_order_access_token_hash
  before insert or update of customer_id, guest_access_token_hash
  on public.orders
  for each row
  execute function public.ensure_guest_order_access_token_hash();

alter table public.orders
  drop constraint if exists orders_guest_access_token_rule;

alter table public.orders
  add constraint orders_guest_access_token_rule check (
    (
      customer_id is null
      and guest_access_token_hash ~ '^[0-9a-f]{64}$'
    )
    or (
      customer_id is not null
      and guest_access_token_hash is null
    )
  );

revoke execute on function public.ensure_guest_order_access_token_hash()
  from public, anon, authenticated;
grant execute on function public.ensure_guest_order_access_token_hash()
  to service_role;

notify pgrst, 'reload schema';
