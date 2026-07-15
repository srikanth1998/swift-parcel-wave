import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { STATUS_NOTIFICATION } from "./order-status";

type OrderStatus = Database["public"]["Enums"]["order_status_enum"];

const orderStatusSchema = z.enum([
  "order_placed",
  "payment_confirmed",
  "order_confirmed",
  "picking_items",
  "packing",
  "ready_for_delivery",
  "sent_for_delivery",
  "completed",
  "cancelled",
  "refunded",
]);

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function requireAdmin() {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = userScopedClient();
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: data.user.id,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
  return { userId: data.user.id };
}

// Auth gate for every distributor-facing (non-admin) function below. Returns
// the caller's own distributor_id, resolved server-side from user_roles —
// never trust a client-supplied distributorId for authorization.
async function requireDistributor() {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = userScopedClient();
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: distributorId, error: rpcError } = await supabase.rpc("get_my_distributor_id");
  if (rpcError || !distributorId) throw new Error("Distributor access required");
  return { userId: data.user.id, distributorId };
}

// ---------- Admin: manage distributors + coverage ----------

export const getAdminDistributors = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: distributors, error: distError }, { data: areas, error: areasError }] =
    await Promise.all([
      supabaseAdmin
        .from("distributors")
        .select("id, name, contact_phone, contact_email, is_active, created_at")
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("service_areas")
        .select("id, distributor_id, pincode")
        .order("pincode", { ascending: true }),
    ]);
  if (distError) throw new Error(distError.message);
  if (areasError) throw new Error(areasError.message);

  const areasByDistributor = new Map<string, { id: string; pincode: string }[]>();
  (areas ?? []).forEach((area) => {
    const list = areasByDistributor.get(area.distributor_id) ?? [];
    list.push({ id: area.id, pincode: area.pincode });
    areasByDistributor.set(area.distributor_id, list);
  });

  return (distributors ?? []).map((d) => ({
    ...d,
    serviceAreas: areasByDistributor.get(d.id) ?? [],
  }));
});

const distributorInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  contactEmail: z.string().trim().email().max(255).nullable().or(z.literal("")).optional(),
  isActive: z.boolean(),
});

export const upsertAdminDistributor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => distributorInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      name: data.name,
      contact_phone: data.contactPhone || null,
      contact_email: data.contactEmail || null,
      is_active: data.isActive,
    };

    const result = data.id
      ? await supabaseAdmin.from("distributors").update(row).eq("id", data.id)
      : await supabaseAdmin.from("distributors").insert(row);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

const addServiceAreaSchema = z.object({
  distributorId: z.string().uuid(),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
});

export const addServiceArea = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => addServiceAreaSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("service_areas").insert({
      distributor_id: data.distributorId,
      pincode: data.pincode,
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error(`Pincode ${data.pincode} is already covered by another distributor.`);
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeServiceArea = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("service_areas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Assigns an existing account (identified by the email they've signed in
// with) to the distributor role for a specific distributor. They must
// already have an account — same convention as admin's staff/admin role
// assignment: promote an existing user, don't create one on their behalf.
const assignDistributorUserSchema = z.object({
  email: z.string().trim().email(),
  distributorId: z.string().uuid(),
});

export const assignDistributorUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => assignDistributorUserSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const target = data.email.toLowerCase();
    let userId: string | null = null;
    let page = 1;
    while (!userId) {
      const { data: page_, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      const found = page_.users.find((u) => u.email?.toLowerCase() === target);
      if (found) userId = found.id;
      if (page_.users.length < 200) break;
      page += 1;
    }
    if (!userId) {
      throw new Error("No account found with that email. They need to sign up first.");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "distributor");
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "distributor",
      distributor_id: data.distributorId,
    });
    if (insertError) throw new Error(insertError.message);
    return { ok: true };
  });

export const removeDistributorUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "distributor");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Lists which users currently hold the distributor role, for the admin
// distributor-management UI to show who's assigned where.
export const getAdminDistributorUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: roles, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, distributor_id")
    .eq("role", "distributor");
  if (error) throw new Error(error.message);

  const userIds = (roles ?? []).map((r) => r.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, referral_code")
    .in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || p.referral_code]));

  const emailById = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data.user?.email) emailById.set(id, data.user.email);
    }),
  );

  return (roles ?? []).map((r) => ({
    userId: r.user_id,
    distributorId: r.distributor_id!,
    name: nameById.get(r.user_id) ?? "Unknown",
    email: emailById.get(r.user_id) ?? null,
  }));
});

// ---------- Distributor: self-service dashboard ----------

const DISTRIBUTOR_LOW_STOCK_THRESHOLD = 10;

export const getDistributorOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { distributorId } = await requireDistributor();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ data: distributor }, { data: orders, error: ordersError }, { data: inventory, error: invError }] =
    await Promise.all([
      supabaseAdmin.from("distributors").select("id, name, is_active").eq("id", distributorId).maybeSingle(),
      supabaseAdmin
        .from("orders")
        .select("id, order_number, order_status, payment_status, total, created_at")
        .eq("distributor_id", distributorId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("distributor_inventory")
        .select("id, stock_qty")
        .eq("distributor_id", distributorId),
    ]);
  if (ordersError) throw new Error(ordersError.message);
  if (invError) throw new Error(invError.message);

  const orderRows = orders ?? [];
  const inventoryRows = inventory ?? [];
  const pendingOrders = orderRows.filter(
    (o) => !["completed", "cancelled", "refunded"].includes(o.order_status),
  );
  const revenueCents = orderRows
    .filter((o) => o.payment_status === "confirmed" && o.order_status !== "refunded")
    .reduce((sum, o) => sum + o.total, 0);

  return {
    distributor,
    stats: {
      orders30d: orderRows.length,
      pendingOrders: pendingOrders.length,
      revenue30dCents: revenueCents,
      lowStockItems: inventoryRows.filter((i) => i.stock_qty > 0 && i.stock_qty <= DISTRIBUTOR_LOW_STOCK_THRESHOLD)
        .length,
      outOfStockItems: inventoryRows.filter((i) => i.stock_qty <= 0).length,
    },
    recentOrders: orderRows.slice(0, 8),
  };
});

const distributorOrdersSchema = z.object({
  orderStatus: z
    .union([orderStatusSchema, z.literal("all")])
    .optional()
    .default("all"),
});

export const getDistributorOrders = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => distributorOrdersSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { distributorId } = await requireDistributor();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("orders")
      .select(
        "id, order_number, order_status, payment_status, payment_method, subtotal, tax, delivery_charge, discount, total, customer_notes, delivery_instructions, created_at, delivery_addresses(full_name, phone, line1, line2, city, state, zip, instructions)",
      )
      .eq("distributor_id", distributorId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (data.orderStatus !== "all") query = query.eq("order_status", data.orderStatus);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const orders = rows ?? [];
    const orderIds = orders.map((o) => o.id);
    const { data: items, error: itemsError } = orderIds.length
      ? await supabaseAdmin
          .from("order_items")
          .select("id, order_id, name_snapshot, ordered_qty, picked_qty, unit_price_cents, is_unavailable")
          .in("order_id", orderIds)
      : { data: [], error: null };
    if (itemsError) throw new Error(itemsError.message);

    const itemsByOrder = new Map<string, typeof items>();
    (items ?? []).forEach((item) => {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    });

    return orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }));
  });

// Distributors operate within the fulfillment lifecycle only — they cannot
// touch payment status, cancellations, or refunds (those stay admin/staff).
const DISTRIBUTOR_ALLOWED_STATUSES = new Set<OrderStatus>([
  "order_confirmed",
  "picking_items",
  "packing",
  "ready_for_delivery",
  "sent_for_delivery",
]);

const updateDistributorOrderSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: orderStatusSchema,
});

export const updateDistributorOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateDistributorOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { distributorId } = await requireDistributor();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!DISTRIBUTOR_ALLOWED_STATUSES.has(data.orderStatus)) {
      throw new Error("Distributors cannot set this order status.");
    }

    // Verify this order actually belongs to the caller's distributor before
    // allowing any update — never trust a client-supplied orderId alone.
    const { data: current, error: currentError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, order_status, distributor_id")
      .eq("id", data.orderId)
      .single();
    if (currentError || !current) throw new Error(currentError?.message ?? "Order not found");
    if (current.distributor_id !== distributorId) {
      throw new Error("This order does not belong to your distributor.");
    }

    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["orders"]["Update"] = { order_status: data.orderStatus };
    if (data.orderStatus === "order_confirmed") patch.confirmed_at = now;
    if (data.orderStatus === "picking_items") patch.picking_started_at = now;
    if (data.orderStatus === "packing") patch.packing_started_at = now;
    if (data.orderStatus === "ready_for_delivery") patch.ready_for_delivery_at = now;
    if (data.orderStatus === "sent_for_delivery") patch.sent_for_delivery_at = now;

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", data.orderId);
    if (error) throw new Error(error.message);

    if (current.customer_id && data.orderStatus !== current.order_status) {
      const notification = STATUS_NOTIFICATION[data.orderStatus];
      if (notification) {
        await supabaseAdmin.from("notifications").insert({
          user_id: current.customer_id,
          order_id: current.id,
          type: data.orderStatus,
          title: notification.title,
          body: notification.body,
        });
      }
    }

    return { ok: true };
  });

export const getDistributorInventory = createServerFn({ method: "GET" }).handler(async () => {
  const { distributorId } = await requireDistributor();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: inventory, error: invError }, { data: adjustments, error: adjError }] = await Promise.all([
    supabaseAdmin
      .from("distributor_inventory")
      .select(
        "id, product_id, stock_qty, products(name, slug, unit_label, price_cents, is_active, categories(name))",
      )
      .eq("distributor_id", distributorId)
      .order("stock_qty", { ascending: true }),
    supabaseAdmin
      .from("inventory_adjustments")
      .select("id, product_id, delta, previous_qty, new_qty, reason, note, created_at")
      .eq("distributor_id", distributorId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (invError) throw new Error(invError.message);
  if (adjError) throw new Error(adjError.message);

  const rows = inventory ?? [];
  const nameById = new Map(rows.map((r) => [r.product_id, r.products?.name ?? "Unknown"]));

  return {
    items: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.products?.name ?? "Unknown product",
      slug: r.products?.slug ?? "",
      unitLabel: r.products?.unit_label ?? "",
      priceCents: r.products?.price_cents ?? 0,
      isActive: r.products?.is_active ?? false,
      category: r.products?.categories?.name ?? null,
      stockQty: r.stock_qty,
      status:
        r.stock_qty <= 0 ? "out" : r.stock_qty <= DISTRIBUTOR_LOW_STOCK_THRESHOLD ? "low" : "ok",
    })),
    recentAdjustments: (adjustments ?? []).map((a) => ({
      ...a,
      productName: nameById.get(a.product_id) ?? "Deleted product",
    })),
    stats: {
      totalItems: rows.length,
      lowStock: rows.filter((r) => r.stock_qty > 0 && r.stock_qty <= DISTRIBUTOR_LOW_STOCK_THRESHOLD).length,
      outOfStock: rows.filter((r) => r.stock_qty <= 0).length,
      totalUnits: rows.reduce((sum, r) => sum + r.stock_qty, 0),
    },
  };
});

const adjustDistributorSchema = z.object({
  productId: z.string().uuid(),
  mode: z.enum(["set", "delta"]),
  amount: z.number().int().min(-1000000).max(1000000),
  reason: z.enum(["restock", "correction", "damage", "return"]),
  note: z.string().trim().max(300).nullable().optional(),
});

export const adjustDistributorInventory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adjustDistributorSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId, distributorId } = await requireDistributor();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: rowError } = await supabaseAdmin
      .from("distributor_inventory")
      .select("id, stock_qty")
      .eq("distributor_id", distributorId)
      .eq("product_id", data.productId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row) throw new Error("This product is not stocked by your distributor.");

    const previousQty = row.stock_qty;
    const nextQty = data.mode === "set" ? data.amount : previousQty + data.amount;
    if (nextQty < 0) throw new Error("Stock cannot go below zero.");
    const delta = nextQty - previousQty;
    if (delta === 0) throw new Error("No change to apply.");

    const { error: updateError } = await supabaseAdmin
      .from("distributor_inventory")
      .update({ stock_qty: nextQty })
      .eq("id", row.id);
    if (updateError) throw new Error(updateError.message);

    const { error: logError } = await supabaseAdmin.from("inventory_adjustments").insert({
      product_id: data.productId,
      distributor_id: distributorId,
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
