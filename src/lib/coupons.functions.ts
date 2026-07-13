import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { evaluateCoupon, normalizeCouponCode } from "./coupon-eval";

function userScopedClient() {
  const auth = getRequestHeader("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function getOptionalUserId(): Promise<string | null> {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data } = await userScopedClient().auth.getUser(auth.slice(7));
  return data.user?.id ?? null;
}

async function requireAdmin() {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const supabase = userScopedClient();
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: data.user.id,
    _role: "admin",
  });
  if (roleError || !isAdmin) throw new Error("Admin access required");
  return { userId: data.user.id };
}

// ---------- Customer-facing: validate a coupon against a cart subtotal ----------

const validateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotalCents: z.number().int().min(0),
});

export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => validateSchema.parse(input))
  .handler(async ({ data }) => {
    const userId = await getOptionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await evaluateCoupon(supabaseAdmin, data.code, data.subtotalCents, userId);
    if (!result.ok) return { ok: false as const, reason: result.reason };
    return {
      ok: true as const,
      code: result.code,
      discountCents: result.discountCents,
      description: result.description,
    };
  });

// ---------- Admin: list / upsert / toggle ----------

export const getAdminCoupons = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: coupons, error } = await supabaseAdmin
    .from("coupons")
    .select(
      "id, code, description, type, value, min_order_cents, max_discount_cents, usage_limit, per_user_limit, used_count, starts_at, expires_at, is_active, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);

  const now = Date.now();
  const rows = coupons ?? [];
  return {
    coupons: rows.map((coupon) => {
      const expired = coupon.expires_at ? new Date(coupon.expires_at).getTime() < now : false;
      const notStarted = coupon.starts_at ? new Date(coupon.starts_at).getTime() > now : false;
      const exhausted = coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit;
      const state = !coupon.is_active
        ? "disabled"
        : expired
          ? "expired"
          : exhausted
            ? "exhausted"
            : notStarted
              ? "scheduled"
              : "active";
      return { ...coupon, state };
    }),
    stats: {
      total: rows.length,
      active: rows.filter((c) => c.is_active).length,
      redemptions: rows.reduce((sum, c) => sum + c.used_count, 0),
    },
  };
});

const couponInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    code: z.string().trim().min(3).max(40),
    description: z.string().trim().max(200).nullable().optional(),
    type: z.enum(["percentage", "fixed"]),
    // percentage: 1-100. fixed: rupees (converted to paise below).
    value: z.number().min(0.01),
    minOrderRupees: z.number().min(0).max(1000000).default(0),
    maxDiscountRupees: z.number().min(0).max(1000000).nullable().optional(),
    usageLimit: z.number().int().min(0).max(1000000).nullable().optional(),
    perUserLimit: z.number().int().min(0).max(10000).nullable().optional(),
    startsAt: z.string().trim().nullable().optional(),
    expiresAt: z.string().trim().nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.type !== "percentage" || data.value <= 100, {
    message: "Percentage discount cannot exceed 100.",
    path: ["value"],
  });

export const upsertAdminCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => couponInputSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const value =
      data.type === "percentage" ? Math.round(data.value) : Math.round(data.value * 100);

    const row = {
      code: normalizeCouponCode(data.code),
      description: data.description || null,
      type: data.type,
      value,
      min_order_cents: Math.round((data.minOrderRupees ?? 0) * 100),
      max_discount_cents:
        data.maxDiscountRupees != null ? Math.round(data.maxDiscountRupees * 100) : null,
      usage_limit: data.usageLimit ?? null,
      per_user_limit: data.perUserLimit ?? null,
      starts_at: data.startsAt || null,
      expires_at: data.expiresAt || null,
      is_active: data.isActive,
    };

    const result = data.id
      ? await supabaseAdmin.from("coupons").update(row).eq("id", data.id)
      : await supabaseAdmin.from("coupons").insert(row);
    if (result.error) {
      if (result.error.code === "23505") {
        throw new Error("A coupon with that code already exists.");
      }
      throw new Error(result.error.message);
    }
    return { ok: true };
  });

const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export const setCouponActive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => toggleSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("coupons")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
