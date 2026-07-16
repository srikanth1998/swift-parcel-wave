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
        .select("id, name, contact_phone, contact_email, is_active, can_supply, created_at")
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
  canSupply: z.boolean().optional().default(false),
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
      can_supply: data.canSupply,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("distributors").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from("distributors")
      .insert(row)
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    // A new hub distributor starts holding stock immediately (mirrors what
    // the original migration did for Main Warehouse). A new regular
    // distributor deliberately starts empty — they're expected to request
    // stock from a hub via requestStockTransfer, that's the whole point.
    if (data.canSupply) {
      const { data: allProducts, error: productsError } = await supabaseAdmin
        .from("products")
        .select("id, stock_qty");
      if (productsError) throw new Error(productsError.message);
      if (allProducts && allProducts.length > 0) {
        const { error: seedError } = await supabaseAdmin.from("distributor_inventory").insert(
          allProducts.map((p) => ({
            distributor_id: created.id,
            product_id: p.id,
            stock_qty: p.stock_qty,
          })),
        );
        if (seedError) throw new Error(seedError.message);
      }
    }

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

  const [
    { data: distributor },
    { data: orders, error: ordersError },
    { data: inventory, error: invError },
    { data: serviceAreas, error: areasError },
  ] = await Promise.all([
    supabaseAdmin
      .from("distributors")
      .select("id, name, is_active, can_supply")
      .eq("id", distributorId)
      .maybeSingle(),
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
    supabaseAdmin
      .from("service_areas")
      .select("id, pincode")
      .eq("distributor_id", distributorId)
      .order("pincode", { ascending: true }),
  ]);
  if (ordersError) throw new Error(ordersError.message);
  if (invError) throw new Error(invError.message);
  if (areasError) throw new Error(areasError.message);

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
    serviceAreas: serviceAreas ?? [],
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
        "id, order_number, order_status, payment_status, payment_method, subtotal, tax, delivery_charge, discount, total, customer_notes, delivery_instructions, substitution_preference, created_at, delivery_addresses(full_name, phone, line1, line2, city, state, zip, instructions)",
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
          .select(
            "id, order_id, product_id, name_snapshot, ordered_qty, picked_qty, unit_price_cents, is_unavailable, replacement_product_id",
          )
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

// Lists the WHOLE active catalog, not just products this distributor
// already has a distributor_inventory row for — otherwise a freshly created
// distributor (zero rows) sees an empty page with nothing to request stock
// for, which is exactly the discoverability trap that let the original
// zero-inventory bug go unnoticed. Products with no row yet show
// status "not_stocked" (distinct from "out" — they were never stocked in
// the first place, not "ran out") and hasInventoryRow: false, which the UI
// uses to disable direct "Adjust" (only requestStockTransfer works until a
// hub distributor fulfils a request and the row is created).
export const getDistributorInventory = createServerFn({ method: "GET" }).handler(async () => {
  const { distributorId } = await requireDistributor();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [
    { data: allProducts, error: productsError },
    { data: inventory, error: invError },
    { data: adjustments, error: adjError },
  ] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select("id, name, slug, unit_label, price_cents, is_active, categories(name)")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("distributor_inventory")
      .select("id, product_id, stock_qty")
      .eq("distributor_id", distributorId),
    supabaseAdmin
      .from("inventory_adjustments")
      .select("id, product_id, delta, previous_qty, new_qty, reason, note, created_at")
      .eq("distributor_id", distributorId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (productsError) throw new Error(productsError.message);
  if (invError) throw new Error(invError.message);
  if (adjError) throw new Error(adjError.message);

  const invByProduct = new Map((inventory ?? []).map((r) => [r.product_id, r]));
  const products = allProducts ?? [];
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  const items = products.map((p) => {
    const row = invByProduct.get(p.id);
    const stockQty = row?.stock_qty ?? 0;
    const status = !row ? "not_stocked" : stockQty <= 0 ? "out" : stockQty <= DISTRIBUTOR_LOW_STOCK_THRESHOLD ? "low" : "ok";
    return {
      id: row?.id ?? null,
      productId: p.id,
      name: p.name,
      slug: p.slug,
      unitLabel: p.unit_label,
      priceCents: p.price_cents,
      isActive: p.is_active,
      category: p.categories?.name ?? null,
      stockQty,
      hasInventoryRow: !!row,
      status,
    };
  });

  return {
    items,
    recentAdjustments: (adjustments ?? []).map((a) => ({
      ...a,
      productName: nameById.get(a.product_id) ?? "Deleted product",
    })),
    stats: {
      totalItems: items.filter((i) => i.hasInventoryRow).length,
      lowStock: items.filter((i) => i.status === "low").length,
      outOfStock: items.filter((i) => i.status === "out").length,
      totalUnits: items.reduce((sum, i) => sum + i.stockQty, 0),
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

// ---------- Stock transfer requests (local distributor <- supply hub) ----------

// Auth gate for reviewing/fulfilling stock transfer requests: admin, or a
// distributor flagged as a supply hub (distributors.can_supply). Returns the
// caller's own distributor_id when they're a hub (null for admin) so the
// caller can default "fulfilled by" to themselves.
async function requireSupplier() {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = userScopedClient();
  const { data: userData, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !userData.user) throw new Error("Unauthorized");

  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (isAdmin) return { userId: userData.user.id, isAdmin: true, distributorId: null as string | null };

  const { data: distributorId } = await supabase.rpc("get_my_distributor_id");
  if (!distributorId) throw new Error("Supplier access required");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: distributor } = await supabaseAdmin
    .from("distributors")
    .select("can_supply")
    .eq("id", distributorId)
    .maybeSingle();
  if (!distributor?.can_supply) throw new Error("Supplier access required");

  return { userId: userData.user.id, isAdmin: false, distributorId };
}

const requestStockSchema = z.object({
  productId: z.string().uuid(),
  requestedQty: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(300).nullable().optional(),
});

export const requestStockTransfer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestStockSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId, distributorId } = await requireDistributor();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("stock_transfer_requests").insert({
      requesting_distributor_id: distributorId,
      product_id: data.productId,
      requested_qty: data.requestedQty,
      note: data.note || null,
      requested_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyStockRequests = createServerFn({ method: "GET" }).handler(async () => {
  const { distributorId } = await requireDistributor();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: requests, error } = await supabaseAdmin
    .from("stock_transfer_requests")
    .select(
      "id, product_id, requested_qty, approved_qty, status, note, admin_note, fulfilled_by_distributor_id, requested_at, reviewed_at, products(name, unit_label)",
    )
    .eq("requesting_distributor_id", distributorId)
    .order("requested_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const supplierIds = [
    ...new Set((requests ?? []).map((r) => r.fulfilled_by_distributor_id).filter((id): id is string => !!id)),
  ];
  const { data: suppliers } = supplierIds.length
    ? await supabaseAdmin.from("distributors").select("id, name").in("id", supplierIds)
    : { data: [] };
  const supplierNameById = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  return (requests ?? []).map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.products?.name ?? "Unknown product",
    unitLabel: r.products?.unit_label ?? "",
    requestedQty: r.requested_qty,
    approvedQty: r.approved_qty,
    status: r.status,
    note: r.note,
    adminNote: r.admin_note,
    fulfilledByName: r.fulfilled_by_distributor_id
      ? (supplierNameById.get(r.fulfilled_by_distributor_id) ?? null)
      : null,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
  }));
});

// Every pending (and recent reviewed) request, system-wide — for a hub
// distributor or admin to triage. Not scoped to "requests directed at me"
// since requests don't pre-specify a supplier; whoever reviews picks who
// fulfils it.
export const getSupplierRequests = createServerFn({ method: "GET" }).handler(async () => {
  await requireSupplier();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: requests, error } = await supabaseAdmin
    .from("stock_transfer_requests")
    .select(
      "id, requesting_distributor_id, product_id, requested_qty, approved_qty, status, note, admin_note, fulfilled_by_distributor_id, requested_at, reviewed_at, products(name, unit_label)",
    )
    .order("requested_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const distributorIds = [
    ...new Set(
      (requests ?? []).flatMap((r) => [r.requesting_distributor_id, r.fulfilled_by_distributor_id]).filter(
        (id): id is string => !!id,
      ),
    ),
  ];
  const { data: distributorRows } = distributorIds.length
    ? await supabaseAdmin.from("distributors").select("id, name").in("id", distributorIds)
    : { data: [] };
  const nameById = new Map((distributorRows ?? []).map((d) => [d.id, d.name]));

  return (requests ?? []).map((r) => ({
    id: r.id,
    requestingDistributorId: r.requesting_distributor_id,
    requestingDistributorName: nameById.get(r.requesting_distributor_id) ?? "Unknown",
    productId: r.product_id,
    productName: r.products?.name ?? "Unknown product",
    unitLabel: r.products?.unit_label ?? "",
    requestedQty: r.requested_qty,
    approvedQty: r.approved_qty,
    status: r.status,
    note: r.note,
    adminNote: r.admin_note,
    fulfilledByDistributorId: r.fulfilled_by_distributor_id,
    fulfilledByName: r.fulfilled_by_distributor_id
      ? (nameById.get(r.fulfilled_by_distributor_id) ?? null)
      : null,
    requestedAt: r.requested_at,
    reviewedAt: r.reviewed_at,
  }));
});

const reviewRequestSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  approvedQty: z.number().int().min(1).max(1_000_000).optional(),
  fulfilledByDistributorId: z.string().uuid().optional(),
  adminNote: z.string().trim().max(300).nullable().optional(),
});

export const reviewStockTransferRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reviewRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId, isAdmin, distributorId } = await requireSupplier();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "reject") {
      const { error } = await supabaseAdmin
        .from("stock_transfer_requests")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          admin_note: data.adminNote || null,
        })
        .eq("id", data.requestId)
        .eq("status", "pending");
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    // Approve: a hub distributor can only fulfil from their own stock; admin
    // must say which distributor is supplying it (defaults are handled
    // client-side, but never trust the client — re-check here too).
    const fulfilledBy = isAdmin ? data.fulfilledByDistributorId : distributorId;
    if (!fulfilledBy) throw new Error("Choose which distributor is supplying this stock.");
    if (!isAdmin && fulfilledBy !== distributorId) {
      throw new Error("You can only fulfil requests from your own stock.");
    }

    const { data: request, error: reqError } = await supabaseAdmin
      .from("stock_transfer_requests")
      .select("requested_qty, status")
      .eq("id", data.requestId)
      .single();
    if (reqError || !request) throw new Error(reqError?.message ?? "Request not found");
    if (request.status !== "pending") throw new Error("This request has already been reviewed.");

    const approvedQty = data.approvedQty ?? request.requested_qty;

    // Atomic, row-locked transfer — see the migration for the full logic.
    const { error: rpcError } = await supabaseAdmin.rpc("approve_stock_transfer", {
      _request_id: data.requestId,
      _approved_qty: approvedQty,
      _fulfilled_by_distributor_id: fulfilledBy,
      _reviewed_by: userId,
      _admin_note: data.adminNote || "",
    });
    if (rpcError) throw new Error(rpcError.message);

    return { ok: true };
  });

// ---------- Picking-time substitution (item unavailable) ----------

// Called by a distributor (scoped to their own order) or admin/staff when an
// order item can't actually be fulfilled. Applies the customer's own
// substitution_preference (captured at checkout) rather than asking the
// picker to decide: replace with a chosen product, adjust the amount due
// (this is COD — nothing has been charged yet, so "refund" means reducing
// what's collected at the door, not a money-back transaction), or just
// notify and leave it for a human to sort out via "contact me".
const markUnavailableSchema = z.object({
  orderItemId: z.string().uuid(),
  replacementProductId: z.string().uuid().optional(),
});

export const markOrderItemUnavailable = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => markUnavailableSchema.parse(input))
  .handler(async ({ data }) => {
    const auth = getRequestHeader("authorization");
    if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const supabase = userScopedClient();
    const { data: userData, error: authErr } = await supabase.auth.getUser(auth.slice(7));
    if (authErr || !userData.user) throw new Error("Unauthorized");

    const [{ data: isAdmin }, { data: isStaff }, { data: myDistributorId }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userData.user.id, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userData.user.id, _role: "staff" }),
      supabase.rpc("get_my_distributor_id"),
    ]);
    if (!isAdmin && !isStaff && !myDistributorId) throw new Error("Not authorized to update this order.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: item, error: itemError } = await supabaseAdmin
      .from("order_items")
      .select(
        "id, order_id, is_unavailable, unit_price_cents, ordered_qty, name_snapshot, orders(distributor_id, customer_id, substitution_preference, subtotal, tax, total, order_number)",
      )
      .eq("id", data.orderItemId)
      .single();
    if (itemError || !item) throw new Error(itemError?.message ?? "Order item not found");
    const order = item.orders;
    if (!order) throw new Error("Order not found");
    if (!isAdmin && !isStaff && order.distributor_id !== myDistributorId) {
      throw new Error("This order does not belong to your distributor.");
    }
    if (item.is_unavailable) throw new Error("This item is already marked unavailable.");

    const patch: Database["public"]["Tables"]["order_items"]["Update"] = { is_unavailable: true };
    if (data.replacementProductId) patch.replacement_product_id = data.replacementProductId;
    const { error: updateError } = await supabaseAdmin
      .from("order_items")
      .update(patch)
      .eq("id", data.orderItemId);
    if (updateError) throw new Error(updateError.message);

    // "refund_if_unavailable": drop this line's value from subtotal/total.
    // Tax is intentionally left as originally computed rather than
    // re-derived (that would mean replicating placeOrder's whole
    // coupon/wallet-aware pricing formula for a single line item) — the
    // resulting overstatement is small (a percentage of one line item).
    if (order.substitution_preference === "refund_if_unavailable") {
      const lineValue = item.unit_price_cents * item.ordered_qty;
      const { error: orderUpdateError } = await supabaseAdmin
        .from("orders")
        .update({
          subtotal: Math.max(order.subtotal - lineValue, 0),
          total: Math.max(order.total - lineValue, 0),
        })
        .eq("id", item.order_id);
      if (orderUpdateError) throw new Error(orderUpdateError.message);
    }

    if (order.customer_id) {
      const isReplaced = order.substitution_preference === "replace_similar" && !!data.replacementProductId;
      const isRefunded = order.substitution_preference === "refund_if_unavailable";
      const title = isReplaced
        ? "An item was substituted"
        : isRefunded
          ? "An item was unavailable — amount adjusted"
          : "An item is unavailable — we'll contact you";
      const body = isReplaced
        ? `"${item.name_snapshot}" wasn't available, so we substituted it with a similar item in order ${order.order_number}.`
        : isRefunded
          ? `"${item.name_snapshot}" wasn't available. We've adjusted the amount due on order ${order.order_number}.`
          : `"${item.name_snapshot}" wasn't available in order ${order.order_number}. We'll be in touch shortly.`;
      await supabaseAdmin.from("notifications").insert({
        user_id: order.customer_id,
        order_id: item.order_id,
        type: "item_unavailable",
        title,
        body,
      });
    }

    return { ok: true };
  });
