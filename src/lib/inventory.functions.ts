import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
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

  const [{ data: products, error: productsError }, { data: adjustments, error: adjustmentsError }] =
    await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id, name, slug, stock_qty, unit_label, is_active, price_cents, categories(name)")
        .order("stock_qty", { ascending: true })
        .limit(500),
      supabaseAdmin
        .from("inventory_adjustments")
        .select("id, product_id, delta, previous_qty, new_qty, reason, note, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (productsError) throw new Error(productsError.message);
  if (adjustmentsError) throw new Error(adjustmentsError.message);

  const productRows = products ?? [];
  const nameById = new Map(productRows.map((product) => [product.id, product.name]));

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
          ? "out"
          : product.stock_qty <= LOW_STOCK_THRESHOLD
            ? "low"
            : "ok",
    })),
    recentAdjustments: (adjustments ?? []).map((adjustment) => ({
      ...adjustment,
      productName: nameById.get(adjustment.product_id) ?? "Deleted product",
    })),
    stats: {
      totalProducts: productRows.length,
      lowStock: productRows.filter((p) => p.stock_qty > 0 && p.stock_qty <= LOW_STOCK_THRESHOLD)
        .length,
      outOfStock: productRows.filter((p) => p.stock_qty <= 0).length,
      totalUnits: productRows.reduce((sum, p) => sum + p.stock_qty, 0),
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
  .inputValidator((input: unknown) => adjustSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireRole(["staff", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, stock_qty")
      .eq("id", data.productId)
      .single();
    if (productError || !product) throw new Error(productError?.message ?? "Product not found");

    const previousQty = product.stock_qty;
    const nextQty = data.mode === "set" ? data.amount : previousQty + data.amount;
    if (nextQty < 0) throw new Error("Stock cannot go below zero.");
    const delta = nextQty - previousQty;
    if (delta === 0) throw new Error("No change to apply.");

    const { error: updateError } = await supabaseAdmin
      .from("products")
      .update({ stock_qty: nextQty })
      .eq("id", data.productId);
    if (updateError) throw new Error(updateError.message);

    const { error: logError } = await supabaseAdmin.from("inventory_adjustments").insert({
      product_id: data.productId,
      delta,
      previous_qty: previousQty,
      new_qty: nextQty,
      reason: data.reason,
      note: data.note || null,
      created_by: userId,
    });
    if (logError) throw new Error(logError.message);

    return { ok: true, newQty: nextQty };
  });
