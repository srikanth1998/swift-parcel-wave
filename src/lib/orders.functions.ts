import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";
import { generateOrderNumber } from "./format";
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
        .select("order_number")
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existing) {
        return { orderNumber: existing.order_number };
      }
    }

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

    // Generate order number using database sequence (collision-resistant)
    const { data: orderNumData, error: orderNumErr } = await supabaseAdmin.rpc("generate_order_number");
    if (orderNumErr || !orderNumData) {
      // Fallback to client-side generation if RPC fails
      console.error("[placeOrder] generate_order_number RPC failed:", orderNumErr);
    }
    const orderNumber = orderNumData || generateOrderNumber();

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

    // Record the coupon redemption atomically (prevents TOCTOU race condition)
    if (couponId) {
      try {
        const { data: redeemed, error: redeemErr } = await supabaseAdmin.rpc("redeem_coupon_atomic", {
          _coupon_id: couponId,
          _order_id: order.id,
          _user_id: userId as string,
          _discount_cents: discount,
        });
        if (redeemErr) {
          console.error("[placeOrder] atomic coupon redemption failed:", redeemErr.message);
          // Fallback to non-atomic redemption for backwards compatibility
          await supabaseAdmin.from("coupon_redemptions").insert({
            coupon_id: couponId,
            order_id: order.id,
            user_id: userId,
            discount_cents: discount,
          });
          // Fetch current count and increment (not perfectly atomic but functional fallback)
          const { data: couponData } = await supabaseAdmin
            .from("coupons")
            .select("used_count")
            .eq("id", couponId)
            .single();
          if (couponData) {
            await supabaseAdmin
              .from("coupons")
              .update({ used_count: (couponData.used_count ?? 0) + 1 })
              .eq("id", couponId);
          }
        } else if (!redeemed) {
          console.warn("[placeOrder] coupon redemption returned false (limit reached)");
        }
      } catch (err) {
        console.error("[placeOrder] coupon redemption bookkeeping failed:", err);
      }
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

    return { orderNumber: order.order_number };
  });

const ORDER_SELECT =
  "id, order_number, order_status, payment_method, payment_status, subtotal, discount, coupon_code, wallet_credit_cents, tax, delivery_charge, total, customer_notes, delivery_instructions, substitution_preference, created_at, confirmed_at, picking_started_at, packing_started_at, packed_at, ready_for_delivery_at, sent_for_delivery_at, customer_id, delivery_addresses(full_name, phone, email, line1, line2, city, state, zip, instructions)";

const getOrderByNumberSchema = z.object({
  orderNumber: z.string(),
  email: z.string().email().optional(),
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

    // If not found and this is a guest order lookup, require email verification
    if (!order) {
      // For guest orders, we need to verify the email matches to prevent PII enumeration
      const { data: guestOrder, error } = await supabaseAdmin
        .from("orders")
        .select(`${ORDER_SELECT}`)
        .eq("order_number", data.orderNumber)
        .is("customer_id", null)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (guestOrder) {
        // H1 FIX: Require email verification for guest order access
        // The email must match the one used during checkout
        const orderEmail = (guestOrder.delivery_addresses as { email?: string })?.email;
        if (!data.email) {
          // Return minimal info indicating order exists but email required
          return {
            requiresEmailVerification: true,
            orderNumber: data.orderNumber,
          };
        }
        if (data.email.toLowerCase() !== orderEmail?.toLowerCase()) {
          // Don't reveal whether the order exists - just return null
          return null;
        }
        order = guestOrder;
      }
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
