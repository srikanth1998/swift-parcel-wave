-- Status values shared by the stock transfer request table and its RPCs.
create type public.stock_transfer_status_enum as enum (
  'pending',
  'approved',
  'rejected'
);
