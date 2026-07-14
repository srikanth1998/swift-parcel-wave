ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
COMMENT ON COLUMN public.products.tags IS 'Product-level trust/feature tags shown on the product page. If empty, categories.tags is used.';
COMMENT ON COLUMN public.categories.tags IS 'Default trust/feature tags applied to every product in this category when the product has no tags of its own.';