revoke all on function public.get_admin_inventory_stats()
  from public, anon, authenticated;

revoke all on function public.adjust_inventory_atomic(
  uuid,
  text,
  integer,
  public.inventory_reason_enum,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.get_admin_inventory_stats()
  to service_role;

grant execute on function public.adjust_inventory_atomic(
  uuid,
  text,
  integer,
  public.inventory_reason_enum,
  text,
  uuid
) to service_role;
