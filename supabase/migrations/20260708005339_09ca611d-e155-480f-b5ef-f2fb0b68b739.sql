
-- Lock down SECURITY DEFINER functions from being called by clients
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Tighten INSERT policies: signed-in users must insert as themselves; anon can still insert (guest checkout)
DROP POLICY "addresses insert any" ON public.delivery_addresses;
CREATE POLICY "addresses guest insert" ON public.delivery_addresses FOR INSERT TO anon WITH CHECK (customer_id IS NULL);
CREATE POLICY "addresses user insert" ON public.delivery_addresses FOR INSERT TO authenticated
  WITH CHECK (customer_id IS NULL OR customer_id = auth.uid());

DROP POLICY "orders insert any" ON public.orders;
CREATE POLICY "orders guest insert" ON public.orders FOR INSERT TO anon WITH CHECK (customer_id IS NULL);
CREATE POLICY "orders user insert" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id IS NULL OR customer_id = auth.uid());

DROP POLICY "order_items insert any" ON public.order_items;
CREATE POLICY "order_items guest insert" ON public.order_items FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id IS NULL));
CREATE POLICY "order_items user insert" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.customer_id IS NULL OR o.customer_id = auth.uid())));
