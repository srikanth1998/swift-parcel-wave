-- Cover the variant order-item foreign key for order history and inventory
-- restoration joins.
create index if not exists order_items_variant_idx
  on public.order_items (variant_id)
  where variant_id is not null;

-- Keep one SELECT policy so authenticated admins do not evaluate two
-- permissive policies for every variant row. Wrapping the role check in a
-- SELECT lets Postgres cache it as an initplan for the statement.
drop policy if exists "Admins can manage variants" on public.product_variants;
drop policy if exists "Anyone can view active variants" on public.product_variants;

create policy "Variants are readable when active or by admins"
  on public.product_variants
  for select
  to anon, authenticated
  using (
    (
      is_active
      and exists (
        select 1
        from public.products p
        where p.id = product_variants.product_id
          and p.is_active
      )
    )
    or (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  );

create policy "Admins can insert variants"
  on public.product_variants
  for insert
  to authenticated
  with check (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  );

create policy "Admins can update variants"
  on public.product_variants
  for update
  to authenticated
  using (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  )
  with check (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  );

create policy "Admins can delete variants"
  on public.product_variants
  for delete
  to authenticated
  using (
    (select public.has_role((select auth.uid()), 'admin'::public.app_role))
  );
