-- Distributor requests for stock supplied by another distributor (normally
-- FEABazaar Main Warehouse). Approval and rejection are performed server-side.
create table public.stock_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  requesting_distributor_id uuid not null
    references public.distributors(id) on delete cascade,
  product_id uuid not null
    references public.products(id) on delete cascade,
  requested_qty integer not null check (requested_qty > 0),
  approved_qty integer check (approved_qty is null or approved_qty >= 0),
  fulfilled_by_distributor_id uuid references public.distributors(id),
  status public.stock_transfer_status_enum not null default 'pending',
  note text,
  admin_note text,
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_stock_transfer_requests_updated_at
  before update on public.stock_transfer_requests
  for each row execute function public.update_updated_at_column();

create index stock_transfer_requests_requesting_idx
  on public.stock_transfer_requests (requesting_distributor_id);

create index stock_transfer_requests_product_idx
  on public.stock_transfer_requests (product_id);

create index stock_transfer_requests_status_idx
  on public.stock_transfer_requests (status)
  where status = 'pending';

create index stock_transfer_requests_fulfilled_by_idx
  on public.stock_transfer_requests (fulfilled_by_distributor_id)
  where fulfilled_by_distributor_id is not null;

create index stock_transfer_requests_requested_by_idx
  on public.stock_transfer_requests (requested_by)
  where requested_by is not null;

create index stock_transfer_requests_reviewed_by_idx
  on public.stock_transfer_requests (reviewed_by)
  where reviewed_by is not null;

alter table public.stock_transfer_requests enable row level security;

create policy "stock transfer requests admin write"
  on public.stock_transfer_requests
  for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "stock transfer requests self insert"
  on public.stock_transfer_requests
  for insert
  with check (
    requesting_distributor_id = public.get_my_distributor_id()
  );

create policy "stock transfer requests self read"
  on public.stock_transfer_requests
  for select
  using (
    requesting_distributor_id = public.get_my_distributor_id()
  );
