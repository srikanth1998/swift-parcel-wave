
-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('customer', 'staff', 'admin');

CREATE TYPE public.order_status_enum AS ENUM (
  'order_placed',
  'payment_confirmed',
  'order_confirmed',
  'picking_items',
  'packing',
  'ready_for_delivery',
  'sent_for_delivery',
  'cancelled',
  'refunded'
);

CREATE TYPE public.payment_method_enum AS ENUM ('cod');
CREATE TYPE public.payment_status_enum AS ENUM ('pending', 'confirmed', 'failed', 'refunded');
CREATE TYPE public.substitution_pref_enum AS ENUM ('replace_similar', 'refund_if_unavailable', 'contact_me');

-- ===== SHARED updated_at TRIGGER =====
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default customer role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$;

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles self select" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== CATEGORIES =====
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  image_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories public read" ON public.categories FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "categories admin write" ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== PRODUCTS =====
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  unit_label TEXT NOT NULL DEFAULT 'each',
  image_url TEXT,
  stock_qty INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON public.products(category_id);
CREATE INDEX products_active_idx ON public.products(is_active);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products public read active" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "products admin write" ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== DELIVERY ADDRESSES =====
CREATE TABLE public.delivery_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.delivery_addresses TO anon, authenticated;
GRANT ALL ON public.delivery_addresses TO service_role;
ALTER TABLE public.delivery_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addresses insert any" ON public.delivery_addresses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "addresses owner read" ON public.delivery_addresses FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "addresses staff read" ON public.delivery_addresses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- ===== ORDERS =====
CREATE SEQUENCE public.order_number_seq START 1000;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  delivery_address_id UUID NOT NULL REFERENCES public.delivery_addresses(id),
  order_status public.order_status_enum NOT NULL DEFAULT 'order_placed',
  payment_method public.payment_method_enum NOT NULL DEFAULT 'cod',
  payment_status public.payment_status_enum NOT NULL DEFAULT 'pending',
  subtotal INT NOT NULL DEFAULT 0,
  discount INT NOT NULL DEFAULT 0,
  tax INT NOT NULL DEFAULT 0,
  delivery_charge INT NOT NULL DEFAULT 0,
  total INT NOT NULL DEFAULT 0,
  customer_notes TEXT,
  delivery_instructions TEXT,
  substitution_preference public.substitution_pref_enum NOT NULL DEFAULT 'replace_similar',
  confirmed_at TIMESTAMPTZ,
  picking_started_at TIMESTAMPTZ,
  packing_started_at TIMESTAMPTZ,
  packed_at TIMESTAMPTZ,
  ready_for_delivery_at TIMESTAMPTZ,
  sent_for_delivery_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON public.orders(customer_id);
CREATE INDEX orders_status_idx ON public.orders(order_status);
GRANT SELECT, INSERT ON public.orders TO anon, authenticated;
GRANT UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders insert any" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "orders owner read" ON public.orders FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "orders staff read" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "orders staff update" ON public.orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== ORDER ITEMS =====
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name_snapshot TEXT NOT NULL,
  unit_price_cents INT NOT NULL,
  ordered_qty INT NOT NULL CHECK (ordered_qty > 0),
  picked_qty INT,
  is_unavailable BOOLEAN NOT NULL DEFAULT false,
  replacement_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);
GRANT SELECT, INSERT ON public.order_items TO anon, authenticated;
GRANT UPDATE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_items insert any" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "order_items owner read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));
CREATE POLICY "order_items staff read" ON public.order_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "order_items staff update" ON public.order_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- ===== NOTIFICATIONS =====
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications owner read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications owner update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== SEED CATEGORIES & PRODUCTS =====
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('fruits-vegetables', 'Fruits & Vegetables', 1),
  ('dairy-eggs', 'Dairy & Eggs', 2),
  ('bakery', 'Bakery', 3),
  ('meat-seafood', 'Meat & Seafood', 4),
  ('pantry', 'Pantry Staples', 5),
  ('beverages', 'Beverages', 6);

INSERT INTO public.products (slug, name, description, category_id, price_cents, unit_label, stock_qty, is_featured, image_url)
SELECT slug, name, description, (SELECT id FROM public.categories WHERE slug = cat_slug), price_cents, unit_label, stock_qty, is_featured, image_url
FROM (VALUES
  ('bananas', 'Organic Bananas', 'Sweet ripe organic bananas, perfect for snacking or smoothies.', 'fruits-vegetables', 199, 'per lb', 200, true, 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600'),
  ('avocados', 'Hass Avocados', 'Creamy Hass avocados, ready to eat.', 'fruits-vegetables', 249, 'each', 150, true, 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=600'),
  ('strawberries', 'Fresh Strawberries', 'Sweet juicy strawberries, 1 lb pack.', 'fruits-vegetables', 499, '1 lb pack', 80, true, 'https://images.unsplash.com/photo-1518635017498-87f514b751ba?w=600'),
  ('spinach', 'Baby Spinach', 'Tender baby spinach leaves, pre-washed.', 'fruits-vegetables', 399, '5 oz bag', 100, false, 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=600'),
  ('tomatoes', 'Roma Tomatoes', 'Firm ripe Roma tomatoes.', 'fruits-vegetables', 179, 'per lb', 120, false, 'https://images.unsplash.com/photo-1592841200221-a6898f307baa?w=600'),
  ('carrots', 'Organic Carrots', 'Crunchy organic carrots.', 'fruits-vegetables', 199, '1 lb bag', 90, false, 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=600'),
  ('whole-milk', 'Whole Milk', 'Farm-fresh whole milk, 1 gallon.', 'dairy-eggs', 449, '1 gallon', 60, true, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600'),
  ('large-eggs', 'Large Brown Eggs', 'Cage-free large brown eggs, dozen.', 'dairy-eggs', 599, 'dozen', 75, true, 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=600'),
  ('greek-yogurt', 'Greek Yogurt', 'Plain Greek yogurt, 32 oz.', 'dairy-eggs', 549, '32 oz tub', 45, false, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=600'),
  ('cheddar-cheese', 'Sharp Cheddar', 'Aged sharp cheddar block, 8 oz.', 'dairy-eggs', 449, '8 oz block', 55, false, 'https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=600'),
  ('butter', 'Unsalted Butter', 'Creamy unsalted butter sticks.', 'dairy-eggs', 599, '1 lb', 40, false, 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=600'),
  ('sourdough', 'Sourdough Loaf', 'Artisan sourdough, baked fresh daily.', 'bakery', 599, 'loaf', 30, true, 'https://images.unsplash.com/photo-1585478259715-1c195ae2b568?w=600'),
  ('croissants', 'Butter Croissants', 'Flaky French-style butter croissants, 4 pack.', 'bakery', 649, '4 pack', 25, true, 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600'),
  ('bagels', 'Everything Bagels', 'Hand-rolled everything bagels, 6 pack.', 'bakery', 449, '6 pack', 35, false, 'https://images.unsplash.com/photo-1585445490582-2d84a2620182?w=600'),
  ('whole-wheat-bread', 'Whole Wheat Bread', 'Sliced whole wheat sandwich bread.', 'bakery', 399, 'loaf', 50, false, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600'),
  ('chicken-breast', 'Chicken Breast', 'Boneless skinless chicken breast.', 'meat-seafood', 899, 'per lb', 40, true, 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=600'),
  ('ground-beef', 'Ground Beef 85/15', 'Fresh ground beef, 85% lean.', 'meat-seafood', 799, 'per lb', 45, false, 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600'),
  ('salmon-fillet', 'Atlantic Salmon', 'Wild-caught salmon fillet.', 'meat-seafood', 1499, 'per lb', 20, true, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600'),
  ('shrimp', 'Jumbo Shrimp', 'Peeled and deveined jumbo shrimp.', 'meat-seafood', 1299, '1 lb bag', 25, false, 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=600'),
  ('bacon', 'Applewood Bacon', 'Thick-cut applewood smoked bacon.', 'meat-seafood', 699, '12 oz pack', 35, false, 'https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=600'),
  ('pasta', 'Spaghetti', 'Classic Italian spaghetti.', 'pantry', 249, '1 lb box', 120, false, 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?w=600'),
  ('olive-oil', 'Extra Virgin Olive Oil', 'Cold-pressed extra virgin olive oil.', 'pantry', 899, '500 ml', 60, true, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600'),
  ('rice', 'Jasmine Rice', 'Long-grain jasmine rice.', 'pantry', 599, '5 lb bag', 80, false, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'),
  ('canned-tomatoes', 'Crushed Tomatoes', 'San Marzano crushed tomatoes.', 'pantry', 299, '28 oz can', 90, false, 'https://images.unsplash.com/photo-1546470427-227df1e3f8ba?w=600'),
  ('peanut-butter', 'Creamy Peanut Butter', 'Natural creamy peanut butter.', 'pantry', 499, '16 oz jar', 70, false, 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=600'),
  ('honey', 'Wildflower Honey', 'Raw wildflower honey.', 'pantry', 799, '12 oz jar', 40, false, 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600'),
  ('orange-juice', 'Fresh Orange Juice', 'Cold-pressed 100% orange juice.', 'beverages', 549, '64 oz', 45, true, 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600'),
  ('sparkling-water', 'Sparkling Water', 'Sparkling water, 12 pack cans.', 'beverages', 599, '12 pack', 55, false, 'https://images.unsplash.com/photo-1560508601-4c8b18a8bd0b?w=600'),
  ('cold-brew', 'Cold Brew Coffee', 'Ready-to-drink cold brew.', 'beverages', 449, '32 oz', 30, false, 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600'),
  ('green-tea', 'Organic Green Tea', 'Loose leaf organic green tea.', 'beverages', 699, '4 oz tin', 40, false, 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600')
) AS v(slug, name, description, cat_slug, price_cents, unit_label, stock_qty, is_featured, image_url);
