-- ===== DISCOUNTS / COUPONS =====

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coupon_type_enum') THEN
    CREATE TYPE public.coupon_type_enum AS ENUM ('percentage', 'fixed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type public.coupon_type_enum NOT NULL,
  -- percentage: whole percent (e.g. 10 = 10%). fixed: amount in paise/cents.
  value INT NOT NULL CHECK (value > 0),
  min_order_cents INT NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
  -- Optional cap on the rupee value of a percentage discount.
  max_discount_cents INT CHECK (max_discount_cents IS NULL OR max_discount_cents >= 0),
  -- NULL = unlimited total redemptions / unlimited per user.
  usage_limit INT CHECK (usage_limit IS NULL OR usage_limit >= 0),
  per_user_limit INT CHECK (per_user_limit IS NULL OR per_user_limit >= 0),
  used_count INT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percentage_range CHECK (type <> 'percentage' OR value <= 100)
);

CREATE INDEX IF NOT EXISTS coupons_active_idx ON public.coupons (is_active, code);

DROP TRIGGER IF EXISTS coupons_updated_at ON public.coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- One redemption row per order; used to enforce per-user limits and to audit.
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  discount_cents INT NOT NULL CHECK (discount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupon_redemptions_unique_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx ON public.coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx ON public.coupon_redemptions (user_id);

-- Link the applied coupon back onto the order (code is snapshotted so history
-- survives coupon deletion / edits).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- Coupons and redemptions are back-office data. All customer-facing coupon
-- logic (validate / redeem) runs through service-role server functions, so we
-- only expose admin SELECT here and never anon/authenticated write access.
GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons admin read" ON public.coupons;
CREATE POLICY "coupons admin read"
  ON public.coupons FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon redemptions admin read" ON public.coupon_redemptions;
CREATE POLICY "coupon redemptions admin read"
  ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));
