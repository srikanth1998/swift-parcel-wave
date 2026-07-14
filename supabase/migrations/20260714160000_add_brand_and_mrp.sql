-- Add brand and mrp_cents columns to products table
-- brand: optional brand/seller name (defaults to store name if null)
-- mrp_cents: original MRP price in paise (if null, no discount shown)

ALTER TABLE products
ADD COLUMN IF NOT EXISTS brand text,
ADD COLUMN IF NOT EXISTS mrp_cents integer;

-- Add check constraint to ensure mrp_cents >= price_cents when both are set
ALTER TABLE products
ADD CONSTRAINT products_mrp_gte_price 
CHECK (mrp_cents IS NULL OR mrp_cents >= price_cents);

-- Add index for filtering by brand
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand) WHERE brand IS NOT NULL;

COMMENT ON COLUMN products.brand IS 'Brand or seller name. If null, defaults to store name in UI.';
COMMENT ON COLUMN products.mrp_cents IS 'Original MRP in paise. If set and > price_cents, discount badge is shown.';
