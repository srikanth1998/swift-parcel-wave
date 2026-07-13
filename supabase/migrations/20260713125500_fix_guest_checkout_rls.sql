-- Fix RLS gaps found during end-to-end checkout verification.

-- 1) "order_items guest insert" checked orders via a subquery, but anon has no
--    SELECT policy on orders, so the check could never pass (RLS hides all
--    rows from the subquery). Use a SECURITY DEFINER helper that performs the
--    narrow ownership check while bypassing RLS.
CREATE OR REPLACE FUNCTION public.is_guest_order(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders WHERE id = _order_id AND customer_id IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.is_guest_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_guest_order(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "order_items guest insert" ON public.order_items;
CREATE POLICY "order_items guest insert"
  ON public.order_items FOR INSERT TO anon
  WITH CHECK (public.is_guest_order(order_id));

-- 2) notifications had no INSERT policy, so the signed-in "order placed"
--    notification written by the user-scoped client was silently rejected.
DROP POLICY IF EXISTS "notifications owner insert" ON public.notifications;
CREATE POLICY "notifications owner insert"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
