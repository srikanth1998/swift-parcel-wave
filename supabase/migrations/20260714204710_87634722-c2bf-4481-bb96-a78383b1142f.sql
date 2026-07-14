
-- 1) orders.idempotency_key
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS idempotency_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_key
  ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2) generate_order_number()
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 100000;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.order_number_seq');
  RETURN 'FEA-' || to_char(now(), 'YYMMDD') || '-' || lpad(n::text, 6, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number() TO authenticated, anon, service_role;

-- 3) wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid,
  amount_cents integer NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('debit','credit')),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users read own wallet transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_order ON public.wallet_transactions(order_id);

-- 4) redeem_coupon_atomic()
CREATE OR REPLACE FUNCTION public.redeem_coupon_atomic(
  _coupon_id uuid,
  _order_id uuid,
  _user_id uuid,
  _discount_cents integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT id, used_count, usage_limit INTO c
    FROM public.coupons WHERE id = _coupon_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.usage_limit IS NOT NULL AND c.used_count >= c.usage_limit THEN
    RETURN false;
  END IF;
  INSERT INTO public.coupon_redemptions (coupon_id, order_id, user_id, discount_cents)
    VALUES (_coupon_id, _order_id, _user_id, _discount_cents);
  UPDATE public.coupons SET used_count = COALESCE(used_count,0) + 1 WHERE id = _coupon_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon_atomic(uuid, uuid, uuid, integer) TO service_role;
