create index if not exists distributor_variant_inventory_product_fk_idx
  on public.distributor_variant_inventory (product_id);
create index if not exists distributor_variant_inventory_variant_fk_idx
  on public.distributor_variant_inventory (variant_id);

drop policy if exists "distributor variant inventory admin write"
  on public.distributor_variant_inventory;
drop policy if exists "distributor variant inventory self read"
  on public.distributor_variant_inventory;
drop policy if exists "distributor variant inventory self write"
  on public.distributor_variant_inventory;

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
