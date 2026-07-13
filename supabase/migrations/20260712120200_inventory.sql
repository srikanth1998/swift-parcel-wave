-- ===== INVENTORY MANAGEMENT =====
-- An append-only ledger of every stock change, plus a helper that decrements
-- product stock when an order is placed. products.stock_qty stays the current
-- level; this table is the audit trail of how it got there.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_reason_enum') THEN
    CREATE TYPE public.inventory_reason_enum AS ENUM ('restock', 'correction', 'order', 'damage', 'return');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  previous_qty INT NOT NULL,
  new_qty INT NOT NULL CHECK (new_qty >= 0),
  reason public.inventory_reason_enum NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_adjustments_product_idx
  ON public.inventory_adjustments (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_adjustments_created_idx
  ON public.inventory_adjustments (created_at DESC);

GRANT SELECT ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory adjustments back office read" ON public.inventory_adjustments;
CREATE POLICY "inventory adjustments back office read"
  ON public.inventory_adjustments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- Atomically decrement stock for every line on an order and log an adjustment
-- row per product. Stock floors at 0 (never oversells into negative). Called
-- from placeOrder via the service-role client after order_items are inserted.
CREATE OR REPLACE FUNCTION public.record_order_stock_decrement(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line RECORD;
  prev_qty INT;
  next_qty INT;
BEGIN
  FOR line IN
    SELECT product_id, ordered_qty
    FROM public.order_items
    WHERE order_id = _order_id AND product_id IS NOT NULL
  LOOP
    SELECT stock_qty INTO prev_qty
    FROM public.products
    WHERE id = line.product_id
    FOR UPDATE;

    IF prev_qty IS NULL THEN
      CONTINUE;
    END IF;

    next_qty := greatest(prev_qty - line.ordered_qty, 0);

    IF next_qty = prev_qty THEN
      CONTINUE;
    END IF;

    UPDATE public.products
    SET stock_qty = next_qty
    WHERE id = line.product_id;

    INSERT INTO public.inventory_adjustments (product_id, delta, previous_qty, new_qty, reason, note)
    VALUES (line.product_id, next_qty - prev_qty, prev_qty, next_qty, 'order',
            'Auto-decrement for order ' || _order_id::text);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.record_order_stock_decrement(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_stock_decrement(UUID) TO service_role;
