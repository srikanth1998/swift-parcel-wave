import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { generateOrderNumber } from "./format";
import { STATUS_NOTIFICATION } from "./order-status";

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

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

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

const placeOrderSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(60),
  zip: z.string().trim().min(3).max(20),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
  customerNotes: z.string().trim().max(500).nullable().optional(),
  substitutionPreference: z.enum(["replace_similar", "refund_if_unavailable", "contact_me"]),
  items: z.array(cartItemSchema).min(1).max(100),
});

const TAX_RATE = 0.08;
const DELIVERY_CHARGE_CENTS = 499;
const FREE_DELIVERY_THRESHOLD_CENTS = 5000;

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = userScopedClient();

    let userId: string | null = null;
    const auth = getRequestHeader("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data: userData } = await supabase.auth.getUser(auth.slice(7));
      userId = userData.user?.id ?? null;
    }

    const pub = publicClient();
    const productIds = data.items.map((i) => i.productId);
    const { data: products, error: prodErr } = await pub
      .from("products")
      .select("id, name, price_cents")
      .in("id", productIds)
      .eq("is_active", true);
    if (prodErr) throw new Error(prodErr.message);
    if (!products || products.length !== productIds.length) {
      throw new Error("One or more products are no longer available.");
    }
    const priceMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    const orderItemRows = data.items.map((it) => {
      const p = priceMap.get(it.productId)!;
      subtotal += p.price_cents * it.qty;
      return {
        product_id: p.id,
        name_snapshot: p.name,
        unit_price_cents: p.price_cents,
        ordered_qty: it.qty,
      };
    });

    const tax = Math.round(subtotal * TAX_RATE);
    const delivery_charge = subtotal >= FREE_DELIVERY_THRESHOLD_CENTS ? 0 : DELIVERY_CHARGE_CENTS;
    const total = subtotal + tax + delivery_charge;

    const { data: addr, error: addrErr } = await supabase
      .from("delivery_addresses")
      .insert({
        customer_id: userId,
        full_name: data.fullName,
        phone: data.phone,
        email: data.email,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        instructions: data.deliveryInstructions || null,
      })
      .select("id")
      .single();
    if (addrErr || !addr) throw new Error(addrErr?.message ?? "Failed to save address");

    const orderNumber = generateOrderNumber();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: userId,
        delivery_address_id: addr.id,
        order_status: "order_placed",
        payment_method: "cod",
        payment_status: "pending",
        subtotal,
        tax,
        delivery_charge,
        total,
        customer_notes: data.customerNotes || null,
        delivery_instructions: data.deliveryInstructions || null,
        substitution_preference: data.substitutionPreference,
      })
      .select("id, order_number")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message ?? "Failed to create order");

    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(orderItemRows.map((r) => ({ ...r, order_id: order.id })));
    if (itemsErr) throw new Error(itemsErr.message);

    if (userId) {
      const n = STATUS_NOTIFICATION["order_placed"]!;
      await supabase.from("notifications").insert({
        user_id: userId,
        order_id: order.id,
        type: "order_placed",
        title: n.title,
        body: n.body,
      });
    }

    return { orderNumber: order.order_number };
  });

const ORDER_SELECT =
  "id, order_number, order_status, payment_method, payment_status, subtotal, tax, delivery_charge, total, customer_notes, delivery_instructions, substitution_preference, created_at, confirmed_at, picking_started_at, packing_started_at, packed_at, ready_for_delivery_at, sent_for_delivery_at, customer_id, delivery_addresses(full_name, phone, email, line1, line2, city, state, zip, instructions)";

export const getOrderByNumber = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ orderNumber: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = userScopedClient();
    const { data: mine } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("order_number", data.orderNumber)
      .maybeSingle();

    let order = mine;
    if (!order) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: guest, error } = await supabaseAdmin
        .from("orders")
        .select(ORDER_SELECT)
        .eq("order_number", data.orderNumber)
        .is("customer_id", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      order = guest;
    }
    if (!order) return null;

    const client = order.customer_id
      ? supabase
      : (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: items, error: itemsErr } = await client
      .from("order_items")
      .select("id, name_snapshot, unit_price_cents, ordered_qty")
      .eq("order_id", order.id);
    if (itemsErr) throw new Error(itemsErr.message);

    return { ...order, items: items ?? [] };
  });

export const getMyOrders = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = userScopedClient();
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const { data: userData } = await supabase.auth.getUser(auth.slice(7));
  const userId = userData.user?.id;
  if (!userId) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_status, total, created_at")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});
