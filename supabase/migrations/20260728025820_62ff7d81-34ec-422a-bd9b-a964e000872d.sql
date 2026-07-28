create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_name text not null default 'Weight',
  option_value text not null,
  sku text,
  price_cents integer not null default 0 check (price_cents >= 0),
  mrp_cents integer check (mrp_cents is null or mrp_cents >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, option_name, option_value)
);

create index product_variants_product_id_idx on public.product_variants (product_id);

grant select on public.product_variants to anon;
grant select on public.product_variants to authenticated;
grant all on public.product_variants to service_role;

alter table public.product_variants enable row level security;

create policy "Anyone can view active variants"
  on public.product_variants for select
  to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.products p
      where p.id = product_variants.product_id and p.is_active
    )
  );

create policy "Admins can manage variants"
  on public.product_variants for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger update_product_variants_updated_at
  before update on public.product_variants
  for each row execute function public.update_updated_at_column();

alter table public.products
  add column if not exists has_variants boolean not null default false;

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_label text;

create or replace function public.record_order_variant_stock_decrement(_order_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  line record;
begin
  for line in
    select variant_id, ordered_qty
    from public.order_items
    where order_id = _order_id and variant_id is not null
  loop
    update public.product_variants
      set stock_qty = greatest(stock_qty - line.ordered_qty, 0)
      where id = line.variant_id;
  end loop;
end;
$$;