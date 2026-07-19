import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function requireRole(allowedRoles: AppRole[]) {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = userScopedClient();
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");
  const checks = await Promise.all(
    allowedRoles.map((role) => supabase.rpc("has_role", { _user_id: data.user!.id, _role: role })),
  );
  if (!checks.some((check) => !check.error && check.data)) {
    throw new Error("Back office access required");
  }
  return { userId: data.user.id };
}

const LOW_STOCK_THRESHOLD = 10;

export const getAdminInventory = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole(["staff", "admin"]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [
    { data: products, error: productsError },
    { data: adjustments, error: adjustmentsError },
    { data: statsRows, error: statsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, slug, stock_qty, unit_label, is_active, price_cents, categories(name)")
      .order("stock_qty", { ascending: true })
      .limit(500),
    supabaseAdmin
      .from("inventory_adjustments")
      .select(
        "id, product_id, delta, previous_qty, new_qty, reason, note, created_at, products(name)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin.rpc("get_admin_inventory_stats"),
  ]);
  if (productsError) throw new Error(productsError.message);
  if (adjustmentsError) throw new Error(adjustmentsError.message);
  if (statsError) throw new Error(statsError.message);

  const productRows = products ?? [];
  const stats = statsRows?.[0];

  return {
    products: productRows.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      unitLabel: product.unit_label,
      isActive: product.is_active,
      priceCents: product.price_cents,
      stockQty: product.stock_qty,
      category: product.categories?.name ?? null,
      status:
        product.stock_qty <= 0
          ? ("out" as const)
          : product.stock_qty <= LOW_STOCK_THRESHOLD
            ? ("low" as const)
            : ("ok" as const),
    })),
    recentAdjustments: (adjustments ?? []).map((adjustment) => ({
      id: adjustment.id,
      product_id: adjustment.product_id,
      delta: adjustment.delta,
      previous_qty: adjustment.previous_qty,
      new_qty: adjustment.new_qty,
      reason: adjustment.reason,
      note: adjustment.note,
      created_at: adjustment.created_at,
      productName: adjustment.products?.name ?? "Deleted product",
    })),
    stats: {
      totalProducts: Number(stats?.total_products ?? 0),
      lowStock: Number(stats?.low_stock ?? 0),
      outOfStock: Number(stats?.out_of_stock ?? 0),
      totalUnits: Number(stats?.total_units ?? 0),
    },
  };
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  mode: z.enum(["set", "delta"]),
  // For "set": the new absolute quantity. For "delta": the signed change.
  amount: z.number().int().min(-1000000).max(1000000),
  reason: z.enum(["restock", "correction", "damage", "return"]),
  note: z.string().trim().max(300).nullable().optional(),
});

export const adjustInventory = createServerFn({ method: "POST" })
  .validator((input: unknown) => adjustSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireRole(["staff", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("adjust_inventory_atomic", {
      _product_id: data.productId,
      _mode: data.mode,
      _amount: data.amount,
      _reason: data.reason,
      // adjust_inventory_atomic's _note parameter is nullable in Postgres (an
      // adjustment can have no note), but the generated Args type has it as a
      // plain `string` — stale relative to the function signature. Widen at
      // the call site rather than hand-editing the generated types file.
      _note: (data.note ?? null) as string,
      _created_by: userId,
    });
    if (error) throw new Error(error.message);

    const result = rows?.[0];
    if (!result) throw new Error("Inventory adjustment did not return a result.");

    return {
      ok: true as const,
      previousQty: result.previous_qty,
      newQty: result.new_qty,
      delta: result.delta,
    };
  });
