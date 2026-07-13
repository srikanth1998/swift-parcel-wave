-- ===== STORE SETTINGS =====
-- Single-row table holding storefront-wide configuration that used to be
-- hardcoded in the app (tax rate, delivery charge, free-delivery threshold)
-- plus basic store contact details. The `id` column is a boolean pinned to
-- true so the table can only ever hold one row.

CREATE TABLE IF NOT EXISTS public.store_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  store_name TEXT NOT NULL DEFAULT 'FEABazaar',
  support_email TEXT,
  support_phone TEXT,
  tax_rate_bps INT NOT NULL DEFAULT 500 CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  delivery_charge_cents INT NOT NULL DEFAULT 4000 CHECK (delivery_charge_cents >= 0),
  free_delivery_threshold_cents INT NOT NULL DEFAULT 49900 CHECK (free_delivery_threshold_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Seed the singleton row with the values that were previously hardcoded.
INSERT INTO public.store_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS store_settings_updated_at ON public.store_settings;
CREATE TRIGGER store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Tax / delivery / contact are not sensitive: the storefront and checkout
-- need to read them, so allow public SELECT. Writes are admin-only and always
-- go through the service-role server functions, so no INSERT/UPDATE policy is
-- exposed to anon/authenticated.
DROP POLICY IF EXISTS "store settings public read" ON public.store_settings;
CREATE POLICY "store settings public read"
  ON public.store_settings FOR SELECT TO anon, authenticated
  USING (true);
