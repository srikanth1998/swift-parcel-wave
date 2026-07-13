import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AdminClient = SupabaseClient<Database>;

export type CouponEvaluation =
  | {
      ok: true;
      couponId: string;
      code: string;
      type: Database["public"]["Enums"]["coupon_type_enum"];
      value: number;
      discountCents: number;
      description: string | null;
    }
  | { ok: false; reason: string };

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Shared, authoritative coupon logic used both by the checkout preview
 * (validateCoupon) and by placeOrder. The service-role client is passed in so
 * this module never imports server secrets and is safe to share across bundles.
 */
export async function evaluateCoupon(
  admin: AdminClient,
  rawCode: string,
  subtotalCents: number,
  userId: string | null,
): Promise<CouponEvaluation> {
  const code = normalizeCouponCode(rawCode);
  if (!code) return { ok: false, reason: "Enter a coupon code." };

  const { data: coupon, error } = await admin
    .from("coupons")
    .select(
      "id, code, description, type, value, min_order_cents, max_discount_cents, usage_limit, per_user_limit, used_count, starts_at, expires_at, is_active",
    )
    .eq("code", code)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!coupon) return { ok: false, reason: "Coupon not found." };
  if (!coupon.is_active) return { ok: false, reason: "This coupon is no longer active." };

  const now = Date.now();
  if (coupon.starts_at && new Date(coupon.starts_at).getTime() > now) {
    return { ok: false, reason: "This coupon isn't active yet." };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < now) {
    return { ok: false, reason: "This coupon has expired." };
  }
  if (subtotalCents < coupon.min_order_cents) {
    return {
      ok: false,
      reason: `Add more to your cart to use this coupon (minimum order applies).`,
    };
  }
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
    return { ok: false, reason: "This coupon has reached its usage limit." };
  }

  if (userId && coupon.per_user_limit != null) {
    const { count, error: countErr } = await admin
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("user_id", userId);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= coupon.per_user_limit) {
      return { ok: false, reason: "You've already used this coupon the maximum number of times." };
    }
  }

  let discountCents: number;
  if (coupon.type === "percentage") {
    discountCents = Math.floor((subtotalCents * coupon.value) / 100);
    if (coupon.max_discount_cents != null) {
      discountCents = Math.min(discountCents, coupon.max_discount_cents);
    }
  } else {
    discountCents = coupon.value;
  }
  discountCents = Math.max(0, Math.min(discountCents, subtotalCents));

  if (discountCents <= 0) {
    return { ok: false, reason: "This coupon doesn't apply to your cart." };
  }

  return {
    ok: true,
    couponId: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discountCents,
    description: coupon.description,
  };
}
