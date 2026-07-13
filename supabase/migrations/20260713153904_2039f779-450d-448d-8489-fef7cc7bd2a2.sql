
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS wallet_credit_cents INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.get_wallet_balance(_user_id uuid)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(commission_amount_cents)::INT
      FROM public.referral_commissions
      WHERE beneficiary_user_id = _user_id
        AND status IN ('approved','paid')
    ), 0)
    -
    COALESCE((
      SELECT SUM(wallet_credit_cents)::INT
      FROM public.orders
      WHERE customer_id = _user_id
        AND wallet_credit_cents > 0
        AND (order_status IS NULL OR order_status::text NOT IN ('cancelled','refunded'))
    ), 0),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated;
