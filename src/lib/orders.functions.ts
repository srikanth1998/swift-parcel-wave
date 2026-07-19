import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { STATUS_NOTIFICATION } from "./order-status";
import { fetchStoreSettings } from "./store-settings";
import { evaluateCoupon } from "./coupon-eval";
import { computeWalletBalance } from "./wallet.functions";
import { resolveDistributorForPincode } from "./distributor-resolve";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

const guestAccessTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Invalid guest order access token");

async function hashGuestAccessToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const placeOrderSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(5).max(30),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(60),
  zip: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
  customerNotes: z.string().trim().max(500).nullable().optional(),
  substitutionPreference: z.enum(["replace_similar", "refund_if_unavailable", "contact_me"]),
  couponCode: z.string().trim().max(40).nullable().optional(),
  walletCreditCents: z.number().int().min(0).max(10_000_000).optional().default(0),
  items: z.array(cartItemSchema).min(1).max(100),
  idempotencyKey: z.string().uuid().optional(),
  guestAccessToken: guestAccessTokenSchema.optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const userClient = userScopedClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userId: string | null = null;
    const auth = getRequestHeader("authorization");
    if (auth?.startsWith("Bearer ")) {
      const { data: userData } = await userClient.auth.getUser(auth.slice(7));
      userId = userData.user?.id ?? null;
    }

    // Idempotency check: if this order was already placed, return the existing order number
    if (data.idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from("orders")
        .select("order_number, customer_id, guest_access_token_hash")
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existing) {
        if (existing.customer_id === null) {
          if (!data.guestAccessToken) {
            throw new Error("This guest order requires its secure tracking link.");
          }
          const suppliedHash = await hashGuestAccessToken(data.guestAccessToken);
          if (suppliedHash !== existing.guest_access_token_hash) {
            throw new Error("This checkout attempt does not match the existing guest order.");
          }
          return {
            orderNumber: existing.order_number,
            accessToken: data.guestAccessToken,
          };
        }
        return { orderNumber: existing.order_number, accessToken: null };
      }
    }

    if (!userId && !data.guestAccessToken) {
      throw new Error("Guest checkout requires a secure order tracking token. Please try again.");
    }

    const guestAccessTokenHash =
      !userId && data.guestAccessToken ? await hashGuestAccessToken(data.guestAccessToken) : null;

    const pub = publicClient();
    const productIds = data.items.map((i) => i.productId);
    const { data: products, error: prodErr } = await pub
      .from("products")
      .select("id, name, price_cents, stock_qty")
      .in("id", productIds)
      .eq("is_active", true);
    if (prodErr) throw new Error(prodErr.message);
    if (!products || products.length !== productIds.length) {
      throw new Error("One or more products are no longer available.");
    }
    const priceMap = new Map(products.map((p) => [p.id, p]));

    // Stock (global or distributor-level) intentionally does NOT block
    // checkout — an order can always be placed. If a distributor can't
    // actually fulfil a line item, they mark it unavailable when picking and
    // the customer's chosen substitution_preference (replace/refund/contact)
    // takes over from there. See markOrderItemUnavailable in
    // distributors.functions.ts.

    // Resolve the distributor that services this address. Every order must
    // snapshot a distributor — checkout is rejected before anything is
    // written if no distributor covers the pincode. Uses supabaseAdmin since
    // service_areas has no client-readable RLS policy (resolution is
    // server-only).
    const distributor = await resolveDistributorForPincode(supabaseAdmin, data.zip);
    if (!distributor) {
      throw new Error(
        `Sorry, we don't deliver to pincode ${data.zip} yet. Please try a different address.`,
      );
    }

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

    // Pricing is authoritative here: read live store settings and re-evaluate
    // any coupon server-side so the client can't tamper with tax/discount/total.
    const settings = await fetchStoreSettings(pub);

    let discount = 0;
    let couponId: string | null = null;
    let couponCode: string | null = null;
    if (data.couponCode && data.couponCode.trim()) {
      const evaluation = await evaluateCoupon(supabaseAdmin, data.couponCode, subtotal, userId);
      if (!evaluation.ok) throw new Error(evaluation.reason);
      discount = evaluation.discountCents;
      couponId = evaluation.couponId;
      couponCode = evaluation.code;
    }

    const taxableBase = Math.max(subtotal - discount, 0);

    // Wallet credit (referral earnings). Signed-in users only, and capped at
    // the (subtotal − discount) so it never covers tax or delivery, and at the
    // caller's actual spendable balance.
    let walletCredit = 0;
    if (userId && data.walletCreditCents && data.walletCreditCents > 0) {
      const balance = await computeWalletBalance(userId);
      walletCredit = Math.max(0, Math.min(data.walletCreditCents, balance, taxableBase));
    }

    const afterWallet = Math.max(taxableBase - walletCredit, 0);
    const tax = Math.round((afterWallet * settings.taxRateBps) / 10000);
    const delivery_charge =
      subtotal >= settings.freeDeliveryThresholdCents ? 0 : settings.deliveryChargeCents;
    const total = afterWallet + tax + delivery_charge;

    // Generate before any writes so an RPC failure cannot orphan an address.
    const { data: orderNumber, error: orderNumErr } =
      await supabaseAdmin.rpc("generate_order_number");
    if (orderNumErr || !orderNumber) {
      throw new Error(orderNumErr?.message ?? "Could not generate an order number.");
    }

    // All inserts use supabaseAdmin (service_role) to bypass RLS.
    // This is the ONLY path to create orders - direct client inserts are blocked by RLS.
    const addressId = crypto.randomUUID();
    const { error: addrErr } = await supabaseAdmin.from("delivery_addresses").insert({
      id: addressId,
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
    });
    if (addrErr) throw new Error(addrErr.message);

    const orderId = crypto.randomUUID();
    const { error: orderErr } = await supabaseAdmin.from("orders").insert({
      id: orderId,
      order_number: orderNumber,
      customer_id: userId,
      delivery_address_id: addressId,
      distributor_id: distributor.id,
      order_status: "order_placed",
      payment_method: "cod",
      payment_status: "pending",
      subtotal,
      discount,
      wallet_credit_cents: walletCredit,
      tax,
      delivery_charge,
      total,
      coupon_id: couponId,
      coupon_code: couponCode,
      customer_notes: data.customerNotes || null,
      delivery_instructions: data.deliveryInstructions || null,
      substitution_preference: data.substitutionPreference,
      idempotency_key: data.idempotencyKey || null,
      guest_access_token_hash: guestAccessTokenHash,
    });
    if (orderErr) {
      // Cleanup orphaned address
      await supabaseAdmin.from("delivery_addresses").delete().eq("id", addressId);
      throw new Error(orderErr.message);
    }

    const order = { id: orderId, order_number: orderNumber };

    const { error: itemsErr } = await supabaseAdmin
      .from("order_items")
      .insert(orderItemRows.map((r) => ({ ...r, order_id: order.id })));
    if (itemsErr) {
      // Best-effort cleanup so a failed items insert doesn't leave an orphan
      // order behind (deleting the order cascades any inserted items).
      try {
        await supabaseAdmin.from("orders").delete().eq("id", order.id);
        await supabaseAdmin.from("delivery_addresses").delete().eq("id", addressId);
      } catch (cleanupErr) {
        console.error("[placeOrder] orphan cleanup failed:", cleanupErr);
      }
      throw new Error(itemsErr.message);
    }

    // Redeem before inventory and other bookkeeping. If a concurrent checkout
    // consumes the coupon limit first, remove this order instead of silently
    // granting an unrecorded discount.
    if (couponId) {
      const { data: redeemed, error: redeemErr } = await supabaseAdmin.rpc("redeem_coupon_atomic", {
        _order_id: order.id,
      });
      if (redeemErr || !redeemed) {
        try {
          await supabaseAdmin.from("orders").delete().eq("id", order.id);
          await supabaseAdmin.from("delivery_addresses").delete().eq("id", addressId);
        } catch (cleanupErr) {
          console.error("[placeOrder] coupon cleanup failed:", cleanupErr);
        }
        throw new Error(
          redeemErr?.message ?? "This coupon is no longer available. Please review your order.",
        );
      }
    }

    // Post-order bookkeeping. The order already exists, so failures here are
    // logged but never surfaced as a checkout failure to the customer.
    try {
      // Decrement stock (atomic, floors at 0) and log an inventory adjustment per line.
      const { error: stockErr } = await supabaseAdmin.rpc("record_order_stock_decrement", {
        _order_id: order.id,
      });
      if (stockErr) console.error("[placeOrder] stock decrement failed:", stockErr.message);
    } catch (err) {
      console.error("[placeOrder] stock decrement failed:", err);
    }

    // Record wallet transaction to prevent double-spend
    if (walletCredit > 0 && userId) {
      try {
        await supabaseAdmin.from("wallet_transactions").insert({
          user_id: userId,
          order_id: order.id,
          amount_cents: walletCredit,
          transaction_type: "debit",
          description: `Applied to order ${orderNumber}`,
        });
      } catch (err) {
        console.error("[placeOrder] wallet transaction recording failed:", err);
      }
    }

    if (userId) {
      const n = STATUS_NOTIFICATION["order_placed"]!;
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        order_id: order.id,
        type: "order_placed",
        title: n.title,
        body: n.body,
      });
    }

    return {
      orderNumber: order.order_number,
      accessToken: userId ? null : data.guestAccessToken!,
    };
  });

const ORDER_SELECT =
  "id, order_number, order_status, payment_method, payment_status, subtotal, discount, coupon_code, wallet_credit_cents, tax, delivery_charge, total, customer_notes, delivery_instructions, substitution_preference, created_at, confirmed_at, picking_started_at, packing_started_at, packed_at, ready_for_delivery_at, sent_for_delivery_at, customer_id, delivery_addresses(full_name, phone, email, line1, line2, city, state, zip, instructions)";

const getOrderByNumberSchema = z.object({
  orderNumber: z.string().trim().min(1).max(40),
  accessToken: guestAccessTokenSchema.optional(),
});

export const getOrderByNumber = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => getOrderByNumberSchema.parse(input))
  .handler(async ({ data }) => {
    const supabase = userScopedClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // First, try to find the order for the authenticated user
    const { data: mine } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("order_number", data.orderNumber)
      .maybeSingle();

    let order = mine;

    // Guest orders are bearer-token protected. Returning the same generic
    // challenge for every order number avoids an order-existence oracle.
    if (!order) {
      if (!data.accessToken) {
        return { requiresGuestAccessToken: true as const };
      }

      const tokenHash = await hashGuestAccessToken(data.accessToken);
      const { data: guestOrder, error } = await supabaseAdmin
        .from("orders")
        .select(ORDER_SELECT)
        .eq("order_number", data.orderNumber)
        .eq("guest_access_token_hash", tokenHash)
        .is("customer_id", null)
        .maybeSingle();

      if (error) throw new Error(error.message);
      order = guestOrder;
    }

    if (!order) return null;

    // For guest orders, mask sensitive PII (only show partial info)
    const isGuestOrder = !order.customer_id;
    const deliveryAddress = order.delivery_addresses as {
      full_name: string;
      phone: string;
      email: string;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      zip: string;
      instructions: string | null;
    };

    // Fetch order items
    const client = order.customer_id ? supabase : supabaseAdmin;
    const { data: items, error: itemsErr } = await client
      .from("order_items")
      .select("id, name_snapshot, unit_price_cents, ordered_qty")
      .eq("order_id", order.id);
    if (itemsErr) throw new Error(itemsErr.message);

    // For guest orders, mask phone number (show only last 4 digits)
    if (isGuestOrder && deliveryAddress) {
      const phone = deliveryAddress.phone;
      if (phone && phone.length > 4) {
        deliveryAddress.phone = "****" + phone.slice(-4);
      }
    }

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
