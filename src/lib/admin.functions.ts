import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { STATUS_NOTIFICATION } from "./order-status";

type AppRole = Database["public"]["Enums"]["app_role"];
type OrderStatus = Database["public"]["Enums"]["order_status_enum"];
type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

const appRoleSchema = z.enum(["customer", "staff", "admin"]);
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
const paymentStatusSchema = z.enum(["pending", "confirmed", "failed", "refunded"]);

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser() {
  const supabase = userScopedClient();
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");

  return { supabase, userId: data.user.id };
}

async function requireRole(allowedRoles: AppRole[]) {
  const { supabase, userId } = await requireUser();
  const checks = await Promise.all(
    allowedRoles.map((role) =>
      supabase.rpc("has_role", {
        _user_id: userId,
        _role: role,
      }),
    ),
  );
  if (!checks.some((check) => !check.error && check.data)) {
    throw new Error("Back office access required");
  }
  return { userId };
}

function makeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `item-${Date.now()}`;
}

function centsFromRupees(value: number) {
  return Math.round(value * 100);
}

function rupeesFromCents(value: number) {
  return Math.round((value / 100) * 100) / 100;
}

function displayName(profile?: { full_name: string | null; referral_code?: string; id?: string }) {
  if (!profile) return "Guest";
  return profile.full_name?.trim() || profile.referral_code || profile.id?.slice(0, 8) || "User";
}

const orderSelect =
  "id, order_number, order_status, payment_status, payment_method, subtotal, tax, delivery_charge, discount, coupon_code, total, customer_id, customer_notes, delivery_instructions, created_at, updated_at, delivery_addresses(full_name, phone, email, line1, line2, city, state, zip, instructions)";

export const getAdminOverview = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole(["staff", "admin"]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [{ data: orders, error: ordersError }, { data: products, error: productsError }] =
    await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("id, order_number, order_status, payment_status, total, customer_id, created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("products")
        .select("id, name, stock_qty, is_active, is_featured, price_cents")
        .order("stock_qty", { ascending: true })
        .limit(100),
    ]);

  if (ordersError) throw new Error(ordersError.message);
  if (productsError) throw new Error(productsError.message);

  const orderRows = orders ?? [];
  const productRows = products ?? [];
  const pendingOrders = orderRows.filter(
    (order) => !["completed", "cancelled", "refunded"].includes(order.order_status),
  );
  const revenueCents = orderRows
    .filter((order) => order.payment_status === "confirmed" && order.order_status !== "refunded")
    .reduce((total, order) => total + order.total, 0);

  return {
    stats: {
      orders30d: orderRows.length,
      pendingOrders: pendingOrders.length,
      revenue30dCents: revenueCents,
      lowStockProducts: productRows.filter((product) => product.stock_qty <= 10).length,
      inactiveProducts: productRows.filter((product) => !product.is_active).length,
    },
    recentOrders: orderRows.slice(0, 8),
    lowStockProducts: productRows.filter((product) => product.stock_qty <= 10).slice(0, 8),
  };
});

const adminOrdersSchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  orderStatus: z
    .union([orderStatusSchema, z.literal("all")])
    .optional()
    .default("all"),
  paymentStatus: z
    .union([paymentStatusSchema, z.literal("all")])
    .optional()
    .default("all"),
  dateFrom: z.string().trim().optional().default(""),
  dateTo: z.string().trim().optional().default(""),
});

export const getAdminOrders = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => adminOrdersSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await requireRole(["staff", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("orders")
      .select(orderSelect)
      .order("created_at", { ascending: false })
      .limit(250);

    if (data.orderStatus !== "all") query = query.eq("order_status", data.orderStatus);
    if (data.paymentStatus !== "all") query = query.eq("payment_status", data.paymentStatus);
    if (data.dateFrom) query = query.gte("created_at", data.dateFrom);
    if (data.dateTo) query = query.lte("created_at", data.dateTo);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const orders = rows ?? [];
    const orderIds = orders.map((order) => order.id);
    const { data: items, error: itemsError } = orderIds.length
      ? await supabaseAdmin
          .from("order_items")
          .select(
            "id, order_id, name_snapshot, ordered_qty, picked_qty, unit_price_cents, is_unavailable",
          )
          .in("order_id", orderIds)
      : { data: [], error: null };
    if (itemsError) throw new Error(itemsError.message);

    const search = data.search.toLowerCase();
    const itemsByOrder = new Map<string, typeof items>();
    (items ?? []).forEach((item) => {
      const list = itemsByOrder.get(item.order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    });

    return orders
      .filter((order) => {
        if (!search) return true;
        const address = order.delivery_addresses;
        return [
          order.order_number,
          address?.full_name,
          address?.email,
          address?.phone,
          address?.city,
          address?.zip,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .map((order) => ({
        ...order,
        items: itemsByOrder.get(order.id) ?? [],
      }));
  });

const updateOrderSchema = z.object({
  orderId: z.string().uuid(),
  orderStatus: orderStatusSchema.optional(),
  paymentStatus: paymentStatusSchema.optional(),
});

export const updateAdminOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateOrderSchema.parse(input))
  .handler(async ({ data }) => {
    await requireRole(["staff", "admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: currentError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, order_status, payment_status")
      .eq("id", data.orderId)
      .single();
    if (currentError || !current) throw new Error(currentError?.message ?? "Order not found");

    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["orders"]["Update"] = {};
    if (data.orderStatus) {
      patch.order_status = data.orderStatus;
      if (data.orderStatus === "order_confirmed") patch.confirmed_at = now;
      if (data.orderStatus === "picking_items") patch.picking_started_at = now;
      if (data.orderStatus === "packing") patch.packing_started_at = now;
      if (data.orderStatus === "ready_for_delivery") patch.ready_for_delivery_at = now;
      if (data.orderStatus === "sent_for_delivery") patch.sent_for_delivery_at = now;
      if (data.orderStatus === "payment_confirmed") patch.payment_status = "confirmed";
      if (data.orderStatus === "refunded") patch.payment_status = "refunded";
    }
    if (data.paymentStatus) patch.payment_status = data.paymentStatus;

    const { error } = await supabaseAdmin.from("orders").update(patch).eq("id", data.orderId);
    if (error) throw new Error(error.message);

    if (current.customer_id && data.orderStatus && data.orderStatus !== current.order_status) {
      const notification = STATUS_NOTIFICATION[data.orderStatus as OrderStatus];
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

export const getAdminCatalog = createServerFn({ method: "GET" }).handler(async () => {
  await requireRole(["admin"]);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] =
    await Promise.all([
      supabaseAdmin
        .from("categories")
        .select("id, slug, name, image_url, sort_order, tags, created_at, updated_at")
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("products")
        .select(
          "id, slug, name, description, category_id, price_cents, mrp_cents, brand, unit_label, image_url, stock_qty, is_active, is_featured, tags, created_at, updated_at, categories(slug, name)",
        )
        .order("name", { ascending: true }),
    ]);

  if (categoriesError) throw new Error(categoriesError.message);
  if (productsError) throw new Error(productsError.message);

  return {
    categories: categories ?? [],
    products: (products ?? []).map((product) => ({
      ...product,
      price_rupees: rupeesFromCents(product.price_cents),
      mrp_rupees: product.mrp_cents ? rupeesFromCents(product.mrp_cents) : 0,
      brand: product.brand ?? "",
    })),
  };
});

const productInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(140).optional().default(""),
  description: z.string().trim().max(1000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  priceRupees: z.number().min(0).max(1_000_000),
  mrpRupees: z.number().min(0).max(1_000_000).optional().default(0),
  brand: z.string().trim().max(100).optional().default(""),
  unitLabel: z.string().trim().min(1).max(40),
  imageUrl: z.string().trim().url().nullable().or(z.literal("")).optional(),
  stockQty: z.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(60)).max(6).optional().default([]),
});

export const upsertAdminProduct = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => productInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const mrpCents = data.mrpRupees ? centsFromRupees(data.mrpRupees) : null;
    const priceCents = centsFromRupees(data.priceRupees);
    
    const row = {
      name: data.name,
      slug: data.slug ? makeSlug(data.slug) : makeSlug(data.name),
      description: data.description || null,
      category_id: data.categoryId || null,
      price_cents: priceCents,
      mrp_cents: mrpCents && mrpCents > priceCents ? mrpCents : null,
      brand: data.brand || null,
      unit_label: data.unitLabel,
      image_url: data.imageUrl || null,
      stock_qty: data.stockQty,
      is_active: data.isActive,
      is_featured: data.isFeatured,
      tags: data.tags ?? [],
    };

    const result = data.id
      ? await supabaseAdmin.from("products").update(row).eq("id", data.id)
      : await supabaseAdmin.from("products").insert(row);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

// Inline "products board" edits: update the common product fields in one shot.
// When stock changes here it is logged to the inventory ledger (reason
// "correction") so the two modules stay in sync. Slug is intentionally left
// untouched to avoid breaking storefront links.
const productRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().nullable().optional(),
  priceRupees: z.number().min(0).max(1_000_000),
  unitLabel: z.string().trim().min(1).max(40),
  stockQty: z.number().int().min(0).max(1_000_000),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
});

export const updateProductRow = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => productRowSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current, error: readError } = await supabaseAdmin
      .from("products")
      .select("id, stock_qty")
      .eq("id", data.id)
      .single();
    if (readError || !current) throw new Error(readError?.message ?? "Product not found");

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("products")
      .update({
        name: data.name,
        category_id: data.categoryId || null,
        price_cents: centsFromRupees(data.priceRupees),
        unit_label: data.unitLabel,
        stock_qty: data.stockQty,
        is_active: data.isActive,
        is_featured: data.isFeatured,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated || updated.length === 0) {
      throw new Error(
        "Product row was not updated — server role may be misconfigured (service key missing).",
      );
    }

    if (data.stockQty !== current.stock_qty) {
      await supabaseAdmin.from("inventory_adjustments").insert({
        product_id: data.id,
        delta: data.stockQty - current.stock_qty,
        previous_qty: current.stock_qty,
        new_qty: data.stockQty,
        reason: "correction",
        note: "Edited from product board",
        created_by: userId,
      });
    }

    return { ok: true };
  });

const bulkStatusSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  isActive: z.boolean(),
});

export const bulkSetProductActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bulkStatusSchema.parse(input))
  .handler(async ({ data }) => {
    await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("products")
      .update({ is_active: data.isActive, updated_at: new Date().toISOString() })
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error(
        "No products were updated — server role may be misconfigured (service key missing).",
      );
    }
    return { ok: true, updated: updated.length };
  });

const categoryInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().max(120).optional().default(""),
  imageUrl: z.string().trim().url().nullable().or(z.literal("")).optional(),
  sortOrder: z.number().int().min(0).max(10_000),
  tags: z.array(z.string().trim().min(1).max(60)).max(6).optional().default([]),
});

export const upsertAdminCategory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => categoryInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const row = {
      name: data.name,
      slug: data.slug ? makeSlug(data.slug) : makeSlug(data.name),
      image_url: data.imageUrl || null,
      sort_order: data.sortOrder,
      tags: data.tags ?? [],
    };

    const result = data.id
      ? await supabaseAdmin.from("categories").update(row).eq("id", data.id)
      : await supabaseAdmin.from("categories").insert(row);
    if (result.error) throw new Error(result.error.message);
    return { ok: true };
  });

const customerQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
});

export const getAdminCustomers = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => customerQuerySchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, phone, referral_code, referred_by_user_id, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin.from("user_roles").select("user_id, role"),
      ]);
    if (profilesError) throw new Error(profilesError.message);
    if (rolesError) throw new Error(rolesError.message);

    const profileRows = profiles ?? [];
    const profileIds = profileRows.map((profile) => profile.id);
    const [
      { data: orders, error: ordersError },
      { data: deliveryAddresses, error: addressesError },
    ] = profileIds.length
      ? await Promise.all([
          supabaseAdmin
            .from("orders")
            .select("id, customer_id, total, payment_status, order_status")
            .in("customer_id", profileIds),
          supabaseAdmin
            .from("delivery_addresses")
            .select("customer_id, email")
            .in("customer_id", profileIds)
            .order("created_at", { ascending: false }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (ordersError) throw new Error(ordersError.message);
    if (addressesError) throw new Error(addressesError.message);

    const emailByUser = new Map<string, string | null>();
    (deliveryAddresses ?? []).forEach((address) => {
      if (address.customer_id && !emailByUser.has(address.customer_id)) {
        emailByUser.set(address.customer_id, address.email ?? null);
      }
    });

    const rolesByUser = new Map<string, AppRole[]>();
    (roles ?? []).forEach((role) => {
      const list = rolesByUser.get(role.user_id) ?? [];
      list.push(role.role);
      rolesByUser.set(role.user_id, list);
    });

    const statsByUser = new Map<string, { orders: number; spendCents: number }>();
    (orders ?? []).forEach((order) => {
      if (!order.customer_id) return;
      const current = statsByUser.get(order.customer_id) ?? { orders: 0, spendCents: 0 };
      current.orders += 1;
      if (order.payment_status === "confirmed" && order.order_status !== "refunded") {
        current.spendCents += order.total;
      }
      statsByUser.set(order.customer_id, current);
    });

    const search = data.search.toLowerCase();
    return profileRows
      .filter((profile) => {
        if (!search) return true;
        const email = emailByUser.get(profile.id);
        return [profile.full_name, profile.phone, profile.referral_code, email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search));
      })
      .map((profile) => {
        const stats = statsByUser.get(profile.id) ?? { orders: 0, spendCents: 0 };
        return {
          id: profile.id,
          fullName: displayName(profile),
          email: emailByUser.get(profile.id) ?? null,
          phone: profile.phone,
          referralCode: profile.referral_code,
          referredByUserId: profile.referred_by_user_id,
          roles: rolesByUser.get(profile.id) ?? [],
          orderCount: stats.orders,
          spendCents: stats.spendCents,
          createdAt: profile.created_at,
        };
      });
  });

const updateRolesSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(appRoleSchema).min(1),
});

export const updateAdminUserRoles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateRolesSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId: currentUserId } = await requireRole(["admin"]);
    const requestedRoles = [...new Set<AppRole>(["customer", ...data.roles])];
    if (data.userId === currentUserId && !requestedRoles.includes("admin")) {
      throw new Error("You cannot remove your own admin role.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: deleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (deleteError) throw new Error(deleteError.message);

    const { error: insertError } = await supabaseAdmin.from("user_roles").insert(
      requestedRoles.map((role) => ({
        user_id: data.userId,
        role,
      })),
    );
    if (insertError) throw new Error(insertError.message);
    return { ok: true };
  });

// Upload an image (base64-encoded from the browser) to the private
// `product-images` storage bucket and return a very long-lived signed URL
// that is stored on the product/category row. Only admins may upload.
const uploadImageSchema = z.object({
  fileBase64: z.string().min(1),
  filename: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .trim()
    .regex(/^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/i, "Only image files are allowed"),
  folder: z.enum(["products", "categories"]),
});

const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

export const uploadAdminImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => uploadImageSchema.parse(input))
  .handler(async ({ data }) => {
    await requireRole(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const buffer = Buffer.from(data.fileBase64, "base64");
    if (buffer.byteLength === 0) throw new Error("Empty file");
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new Error("Image is larger than 5 MB");
    }

    const safeName = data.filename
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-80) || "image";
    const path = `${data.folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(path, buffer, {
        contentType: data.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("product-images")
      .createSignedUrl(path, TEN_YEARS_SECONDS);
    if (signError || !signed?.signedUrl) {
      throw new Error(signError?.message ?? "Failed to sign uploaded image URL");
    }

    return { url: signed.signedUrl, path };
  });
