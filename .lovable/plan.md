# FEA Bazar — Phase 1 (Customer Side)

Storefront where customers browse groceries, check out (COD), and track their order through an in-app status timeline that stops at **Sent for Delivery**. No delivery-management features anywhere. Warehouse dashboard and email/SMS are deferred to later phases; roles + Google sign-in are scaffolded now so Phase 2 can plug straight in.

## What's in scope this phase

1. **Auth**
  - We are no using Lovable cloud  
  we only using Supabase, if yu are using anything else ask me before proceeeding
  - Email/password sign-up + login.
  - Google sign-in
  - Guest checkout supported (no account required to place an order).
  - `profiles` table (full name, phone) auto-created on signup.
  - `user_roles` table with `app_role` enum (`customer`, `staff`, `admin`) + `has_role()` security-definer function. No staff UI yet — just the schema so Phase 2 can gate the warehouse dashboard.
2. **Product catalog**
  - `/` home: hero + featured categories + featured products.
  - `/shop`: product grid with category filter and search.
  - `/product/$slug`: product detail with add-to-cart + quantity.
  - Seeded with ~6 categories and ~30 grocery products.
3. **Cart**
  - Client-side cart in `localStorage` (works for guests + signed-in users).
  - `/cart`: line items, qty adjust, remove, subtotal.
4. **Checkout** (`/checkout`)
  - Fields exactly as specified: full name, email, phone, delivery address, apt/unit, city, state, ZIP, delivery instructions, payment method (COD only for now), substitution preference (Replace with similar / Refund if unavailable / Contact me), order notes.
  - Order summary: subtotal, tax, delivery charge (flat, waived over threshold), total.
  - **No warehouse pickup option.**
  - On submit: creates `orders` + `order_items` + `delivery_addresses` rows, sets status to `order_placed`, writes an in-app notification, redirects to the order page.
5. **Customer order pages**
  - `/orders` (authenticated): list of the signed-in customer's orders.
  - `/order/$orderNumber`: order number, items, delivery address, payment status, total, current status, **status timeline that stops at Sent for Delivery**, order notes.
  - Final-status message shown when status = `sent_for_delivery`:
    > Your order has been packed by  and out of delivery.
  - Explicitly does **not** render: driver info, tracking URL, live location, ETA, delivered/failed states.
6. **In-app notifications**
  - Bell icon in header for signed-in users with unread count and dropdown list.
  - Notification created on every status transition listed in the spec (placed, payment confirmed, confirmed, preparing, packed, ready for delivery, sent for delivery, cancelled, refunded).
  - The `sent_for_delivery` notification uses the exact copy:
    > Your order is out for delivery.
  - Guest orders skip notification writes (no user_id); guests see status via a shareable order-number link.
7. **Design system**
  - Fresh grocery aesthetic (not the default template). Warm off-white background, deep leafy green primary, tomato-red accent, Figtree headings + Inter body. Tokens defined in `src/styles.css` (oklch), used via semantic Tailwind classes only.
  - Real head metadata on `__root.tsx` (FEA Bazar title/description/og).

## Explicitly excluded (per spec)

No drivers, delivery partners, delivery assignments, tracking, maps, live location, shipping labels, manifests, delivery webhooks, delivery status history, delivery exceptions, delivery-partner payments, returned-delivery flows. No status beyond `sent_for_delivery`. No warehouse-pickup checkout option.

Also deferred to a later phase (not this plan): warehouse ops dashboard, picking/packing UI, print picking list/packing slip, email + SMS channels, real payment processor. The DB and status enum are designed so Phase 2 slots in without migrations of existing data.

## Technical details

**Data model (Lovable Cloud / Supabase)**

```text
profiles(id → auth.users, full_name, phone, created_at)
user_roles(id, user_id → auth.users, role app_role, unique(user_id, role))
categories(id, slug, name, image_url, sort_order)
products(id, slug, name, description, category_id, price_cents,
         unit_label, image_url, stock_qty, is_active, created_at)
delivery_addresses(id, customer_id nullable, full_name, phone, email,
                   line1, line2, city, state, zip, instructions, created_at)
orders(id, order_number, customer_id nullable, delivery_address_id,
       order_status order_status_enum, payment_method, payment_status,
       subtotal, discount, tax, delivery_charge, total,
       customer_notes, delivery_instructions, substitution_preference,
       confirmed_at, picking_started_at, packing_started_at, packed_at,
       ready_for_delivery_at, sent_for_delivery_at,
       created_at, updated_at)
order_items(id, order_id, product_id, name_snapshot, unit_price_cents,
            ordered_qty, picked_qty nullable, is_unavailable bool,
            replacement_product_id nullable)
notifications(id, user_id, order_id, type, title, body, read_at, created_at)
```

Enums: `app_role`, `order_status_enum` with exactly the 10 spec statuses, `payment_method_enum` (`cod` for now), `payment_status_enum`, `substitution_pref_enum`.

**RLS (concise):**

- `products`, `categories`: public SELECT (anon + authenticated).
- `orders`, `order_items`, `notifications`, `delivery_addresses`: owner-only SELECT via `auth.uid() = customer_id`. Staff read-all policy uses `has_role(auth.uid(), 'staff')` (unused this phase but ready).
- INSERT on `orders`/`order_items`/`delivery_addresses`: allowed for anon (guest checkout) and authenticated; server function sets `customer_id` from session when present.
- `profiles`: owner-only read/update; auto-inserted by trigger on signup.
- Every table gets explicit `GRANT` statements to `anon`/`authenticated`/`service_role` per policy.

**Server functions** (`createServerFn`, TanStack Start):

- `placeOrder` — validates cart + checkout form with zod, generates order_number (`FEA-YYMMDD-XXXX`), inserts order/items/address in a single RPC, writes `order_placed` notification if signed in.
- `getMyOrders`, `getOrderByNumber` — protected via `requireSupabaseAuth` for authenticated views; a separate public `getGuestOrderByNumber` reads only non-sensitive fields when accessed via the shareable link.
- `listProducts`, `getProduct`, `listCategories` — public via server publishable client.

**Routing** (file-based, TanStack):

- `/` `/shop` `/product/$slug` `/cart` `/checkout` `/order/$orderNumber` (public)
- `/_authenticated/orders` `/_authenticated/account` (uses managed auth layout)
- `/auth` public sign-in/sign-up page; Google via `lovable.auth.signInWithOAuth('google', ...)` with a same-origin redirect. `supabase--configure_social_auth` called for Google in the same turn.

**Cart**: `useCart()` hook backed by `localStorage`, hydrated in `useEffect` to avoid SSR mismatch.

**Notifications**: written server-side inside `placeOrder` (and future status-change fns). Bell component uses TanStack Query with a Supabase realtime subscription on the `notifications` table for the current user.

## Out of scope reminder for the build

If during implementation something suggests adding driver, delivery-partner, tracking, map, ETA, delivered/failed, shipping-label, manifest, or returned-delivery logic — skip it. The spec forbids it and Phase 1 ends at `sent_for_delivery`.