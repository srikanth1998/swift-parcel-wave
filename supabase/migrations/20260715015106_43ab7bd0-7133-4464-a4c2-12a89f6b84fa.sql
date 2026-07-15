
ALTER TABLE public.delivery_addresses
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS delivery_addresses_customer_saved_idx
  ON public.delivery_addresses (customer_id) WHERE is_saved = true;

DROP POLICY IF EXISTS "addresses owner update" ON public.delivery_addresses;
CREATE POLICY "addresses owner update"
  ON public.delivery_addresses FOR UPDATE
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "addresses owner delete" ON public.delivery_addresses;
CREATE POLICY "addresses owner delete"
  ON public.delivery_addresses FOR DELETE
  USING (customer_id = auth.uid() AND is_saved = true);
