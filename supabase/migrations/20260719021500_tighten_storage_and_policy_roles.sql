-- Product assets are written only by authenticated administrators. The app's
-- server-side service client continues to bypass RLS after checking admin role.
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[]
where id = 'product-images';

drop policy if exists "product images admin read" on storage.objects;
create policy "product images admin read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  );

drop policy if exists "product images admin insert" on storage.objects;
create policy "product images admin insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'categories')
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  );

drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'categories')
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  );

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Policies without an explicit role target PostgreSQL's `public` role, which
-- also includes anonymous API callers. These paths require a signed-in user.
alter policy "distributor inventory admin write" on public.distributor_inventory to authenticated;
alter policy "distributor inventory self read" on public.distributor_inventory to authenticated;
alter policy "distributor inventory self write" on public.distributor_inventory to authenticated;
alter policy "distributors admin write" on public.distributors to authenticated;
alter policy "distributors self read" on public.distributors to authenticated;
alter policy "inventory adjustments distributor insert" on public.inventory_adjustments to authenticated;
alter policy "inventory adjustments distributor read" on public.inventory_adjustments to authenticated;
alter policy "order_items distributor read" on public.order_items to authenticated;
alter policy "order_items distributor update" on public.order_items to authenticated;
alter policy "orders distributor read" on public.orders to authenticated;
alter policy "orders distributor update" on public.orders to authenticated;
alter policy "service areas admin write" on public.service_areas to authenticated;
alter policy "stock transfer requests admin write" on public.stock_transfer_requests to authenticated;
alter policy "stock transfer requests self insert" on public.stock_transfer_requests to authenticated;
alter policy "stock transfer requests self read" on public.stock_transfer_requests to authenticated;
