-- ===== REFERRAL SYSTEM =====

ALTER TYPE public.order_status_enum ADD VALUE IF NOT EXISTS 'completed';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'referral_commission_status') THEN
    CREATE TYPE public.referral_commission_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate TEXT;
BEGIN
  LOOP
    candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE referral_code = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key ON public.profiles (referral_code);
CREATE INDEX IF NOT EXISTS profiles_referred_by_user_id_idx ON public.profiles (referred_by_user_id);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_not_self_referred,
  ADD CONSTRAINT profiles_not_self_referred CHECK (referred_by_user_id IS NULL OR referred_by_user_id <> id);

CREATE OR REPLACE FUNCTION public.enforce_profile_referral_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
      RAISE EXCEPTION 'Referral code cannot be changed after account creation';
    END IF;

    IF NEW.referred_by_user_id IS DISTINCT FROM OLD.referred_by_user_id THEN
      RAISE EXCEPTION 'Referral relationship cannot be changed after account creation';
    END IF;
  END IF;

  IF NEW.referred_by_user_id IS NOT NULL AND NEW.referred_by_user_id = NEW.id THEN
    RAISE EXCEPTION 'Users cannot refer themselves';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_referral_immutable ON public.profiles;
CREATE TRIGGER profiles_referral_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_referral_immutability();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_referral_code TEXT;
  submitted_referral_code TEXT;
  referrer_id UUID;
BEGIN
  submitted_referral_code := nullif(
    upper(trim(COALESCE(
      NEW.raw_user_meta_data->>'referral_code',
      NEW.raw_user_meta_data->>'referrer_code',
      NEW.raw_user_meta_data->>'ref'
    ))),
    ''
  );

  IF submitted_referral_code IS NOT NULL THEN
    SELECT id INTO referrer_id
    FROM public.profiles
    WHERE referral_code = submitted_referral_code;

    IF referrer_id IS NULL THEN
      RAISE EXCEPTION 'Invalid referral code';
    END IF;

    IF referrer_id = NEW.id THEN
      RAISE EXCEPTION 'Users cannot refer themselves';
    END IF;
  END IF;

  new_referral_code := public.generate_referral_code();

  INSERT INTO public.profiles (id, full_name, phone, referral_code, referred_by_user_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    new_referral_code,
    referrer_id
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beneficiary_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_level INT NOT NULL CHECK (referral_level IN (1, 2)),
  commission_percentage NUMERIC(5, 2) NOT NULL,
  order_amount_cents INT NOT NULL CHECK (order_amount_cents >= 0),
  commission_amount_cents INT NOT NULL CHECK (commission_amount_cents >= 0),
  status public.referral_commission_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  CONSTRAINT referral_commissions_no_self_benefit CHECK (buyer_id <> beneficiary_user_id),
  CONSTRAINT referral_commissions_unique_order_level UNIQUE (order_id, referral_level)
);

CREATE INDEX IF NOT EXISTS referral_commissions_beneficiary_idx
  ON public.referral_commissions (beneficiary_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_commissions_buyer_idx
  ON public.referral_commissions (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_commissions_status_idx
  ON public.referral_commissions (status, created_at DESC);

DROP TRIGGER IF EXISTS referral_commissions_updated_at ON public.referral_commissions;
CREATE TRIGGER referral_commissions_updated_at
  BEFORE UPDATE ON public.referral_commissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.referral_commissions TO authenticated;
GRANT ALL ON public.referral_commissions TO service_role;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral commissions beneficiary read"
  ON public.referral_commissions FOR SELECT TO authenticated
  USING (beneficiary_user_id = auth.uid());

CREATE POLICY "referral commissions admin read"
  ON public.referral_commissions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.referral_earnings
WITH (security_invoker = true)
AS
SELECT
  beneficiary_user_id,
  COALESCE(sum(commission_amount_cents) FILTER (WHERE status <> 'cancelled'), 0)::INT AS total_earned_cents,
  COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'pending'), 0)::INT AS pending_cents,
  COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'approved'), 0)::INT AS approved_cents,
  COALESCE(sum(commission_amount_cents) FILTER (WHERE status = 'paid'), 0)::INT AS paid_cents,
  count(*) FILTER (WHERE status <> 'cancelled')::INT AS commission_count
FROM public.referral_commissions
GROUP BY beneficiary_user_id;

GRANT SELECT ON public.referral_earnings TO authenticated;

CREATE OR REPLACE FUNCTION public.is_referral_eligible_order(_order public.orders)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    _order.customer_id IS NOT NULL
    AND _order.payment_status = 'confirmed'
    AND _order.order_status::text = 'completed'
$$;

CREATE OR REPLACE FUNCTION public.process_referral_commissions_for_order(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_order public.orders%ROWTYPE;
  direct_referrer_id UUID;
  second_referrer_id UUID;
  eligible_amount_cents INT;
BEGIN
  SELECT *
  INTO target_order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF target_order.order_status::text IN ('cancelled', 'refunded') OR target_order.payment_status = 'refunded' THEN
    UPDATE public.referral_commissions
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now())
    WHERE order_id = target_order.id
      AND status <> 'cancelled';
    RETURN;
  END IF;

  IF NOT public.is_referral_eligible_order(target_order) THEN
    RETURN;
  END IF;

  SELECT referred_by_user_id
  INTO direct_referrer_id
  FROM public.profiles
  WHERE id = target_order.customer_id;

  IF direct_referrer_id IS NULL OR direct_referrer_id = target_order.customer_id THEN
    RETURN;
  END IF;

  eligible_amount_cents := greatest(target_order.subtotal - target_order.discount, 0);

  INSERT INTO public.referral_commissions (
    order_id,
    buyer_id,
    beneficiary_user_id,
    referral_level,
    commission_percentage,
    order_amount_cents,
    commission_amount_cents,
    status
  )
  VALUES (
    target_order.id,
    target_order.customer_id,
    direct_referrer_id,
    1,
    10.00,
    eligible_amount_cents,
    round(eligible_amount_cents * 0.10)::INT,
    'pending'
  )
  ON CONFLICT (order_id, referral_level) DO NOTHING;

  SELECT referred_by_user_id
  INTO second_referrer_id
  FROM public.profiles
  WHERE id = direct_referrer_id;

  IF second_referrer_id IS NULL
    OR second_referrer_id = target_order.customer_id
    OR second_referrer_id = direct_referrer_id THEN
    RETURN;
  END IF;

  INSERT INTO public.referral_commissions (
    order_id,
    buyer_id,
    beneficiary_user_id,
    referral_level,
    commission_percentage,
    order_amount_cents,
    commission_amount_cents,
    status
  )
  VALUES (
    target_order.id,
    target_order.customer_id,
    second_referrer_id,
    2,
    5.00,
    eligible_amount_cents,
    round(eligible_amount_cents * 0.05)::INT,
    'pending'
  )
  ON CONFLICT (order_id, referral_level) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_order_referral_commissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_referral_commissions_for_order(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_referral_commissions ON public.orders;
CREATE TRIGGER orders_referral_commissions
  AFTER INSERT OR UPDATE OF order_status, payment_status, subtotal, discount ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_referral_commissions();

REVOKE ALL ON FUNCTION public.generate_referral_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_referral_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_referral_eligible_order(public.orders) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_referral_commissions_for_order(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_order_referral_commissions() FROM PUBLIC, anon, authenticated;
