## Goal

Replace the fake "FEABAZAAR" label and hashed fake discount with real, admin-controlled fields: `brand` and `mrp_cents` on `products`.

## Database migration

Add to `public.products`:
- `brand text` (nullable) — optional brand/seller override
- `mrp_cents integer` (nullable) — real original MRP in paise
- CHECK constraint: `mrp_cents IS NULL OR mrp_cents >= price_cents`
- Partial index on `brand` where not null
- Column comments as provided

## Code changes

**src/lib/format.ts**
- Remove `deriveOffer` (hash-based fake offer).
- Add `computeOffer(mrpCents: number | null, priceCents: number)` that returns `{ mrpCents, discountPct }` when `mrpCents > priceCents`, else `null`. No hashing, no randomness.

**src/lib/products.functions.ts**
- Include `brand` and `mrp_cents` in product SELECTs (and any admin catalog queries).
- Remove any sort/logic based on `deriveOffer`. If shop sorts by "discount", sort by real `(mrp_cents - price_cents) / mrp_cents` server-side (or drop that sort if not essential).

**src/components/product-card.tsx**
- Replace hardcoded "FEABAZAAR" label with `product.brand ?? storeName` (fall back to store name from `store_settings`, or just hide the label when brand is null — pick fallback: store name so layout is unchanged).
- Feed `product.mrp_cents` into the new `computeOffer` for the MRP strikethrough and % badge.

**src/routes/product.$slug.tsx**
- Same swap: brand line + real MRP/discount from `computeOffer`.

**src/routes/shop.tsx**
- Update any references to `deriveOffer` to use the real fields; remove the fake-discount sort or repoint it to real MRP.

**src/lib/admin.functions.ts + src/routes/_authenticated/admin.products.tsx**
- Extend product upsert payload with `brand` (string | null) and `mrpRupees` (number | null → `mrp_cents`).
- Add two form fields in the admin product form: "Brand (optional)" text input and "MRP (optional)" number input with helper text: "Leave blank for no discount badge. Must be ≥ price."
- Show existing brand/MRP when editing.

**src/integrations/supabase/types.ts**
- Regenerated automatically after migration approval.

## Behavior after change

- Products with no `mrp_cents` set: no strikethrough, no % OFF badge.
- Products with `mrp_cents > price_cents`: real strikethrough + real "% OFF" computed from the two values.
- Products with `brand`: brand shown above the product name. Otherwise falls back to the store name (keeps current visual density; alternative is to hide the line — say the word if you prefer that).
- No back-fill: all existing products start with `brand = null`, `mrp_cents = null` (so all badges disappear until you set them in admin).

## Open question

Fallback when `brand` is empty: keep showing store name ("FEABazaar") as today, or hide the line entirely? Default in this plan: keep store name fallback.
