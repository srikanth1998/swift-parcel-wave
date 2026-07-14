import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, name, image_url, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z
      .object({
        categorySlug: z.string().optional(),
        search: z.string().optional(),
        featuredOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    
    // If filtering by category, first get the category ID for efficient DB-side filtering
    let categoryId: string | null = null;
    if (data.categorySlug) {
      const { data: cat } = await supabase
        .from("categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      categoryId = cat?.id ?? null;
      // If category not found, return empty array
      if (!categoryId) return [];
    }
    
    let q = supabase
      .from("products")
      .select(
        "id, slug, name, description, price_cents, unit_label, image_url, stock_qty, is_featured, category_id, brand, mrp_cents, categories(slug, name)",
      )
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (data.featuredOnly) q = q.eq("is_featured", true);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    if (categoryId) q = q.eq("category_id", categoryId);
    if (data.limit) q = q.limit(data.limit);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    return rows ?? [];
  });

export const getProduct = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: row, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, description, price_cents, unit_label, image_url, stock_qty, brand, mrp_cents, categories(slug, name)",
      )
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
