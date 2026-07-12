import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type ReferralStatus = Database["public"]["Enums"]["referral_commission_status"];

type ReferralProfile = {
  id: string;
  full_name: string | null;
  referral_code: string;
  referred_by_user_id: string | null;
  created_at: string;
};

type ReferralCommission = {
  id: string;
  order_id: string;
  buyer_id: string;
  beneficiary_user_id: string;
  referral_level: number;
  commission_percentage: number;
  order_amount_cents: number;
  commission_amount_cents: number;
  status: ReferralStatus;
  created_at: string;
};

type ReferralOrder = {
  id: string;
  order_number: string;
  subtotal: number;
  total: number;
  created_at: string;
};

const commissionStatusSchema = z.enum(["pending", "approved", "paid", "cancelled"]);

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

async function requireUser() {
  const supabase = userScopedClient();
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");

  return { supabase, userId: data.user.id };
}

async function requireAdmin() {
  const { supabase, userId } = await requireUser();
  const { data: isAdmin, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  if (error || !isAdmin) throw new Error("Admin access required");
  return { userId };
}

function displayName(profile?: Pick<ReferralProfile, "full_name" | "referral_code" | "id">) {
  if (!profile) return "Unknown user";
  return profile.full_name?.trim() || `User ${profile.referral_code || profile.id.slice(0, 8)}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function sumByStatus(commissions: ReferralCommission[], status: ReferralStatus) {
  return commissions
    .filter((commission) => commission.status === status)
    .reduce((total, commission) => total + commission.commission_amount_cents, 0);
}

function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchProfilesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, referral_code, referred_by_user_id, created_at")
    .in("id", ids);

  if (error) throw new Error(error.message);
  return (data ?? []) as ReferralProfile[];
}

async function fetchOrdersByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, subtotal, total, created_at")
    .in("id", ids);

  if (error) throw new Error(error.message);
  return (data ?? []) as ReferralOrder[];
}

export const getReferralDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireUser();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, referral_code, referred_by_user_id, created_at")
    .eq("id", userId)
    .single();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Profile not found");

  const { data: directRows, error: directError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, referral_code, referred_by_user_id, created_at")
    .eq("referred_by_user_id", userId)
    .order("created_at", { ascending: true });
  if (directError) throw new Error(directError.message);

  const directReferrals = (directRows ?? []) as ReferralProfile[];
  const directIds = directReferrals.map((row) => row.id);

  const { data: secondRows, error: secondError } = directIds.length
    ? await supabaseAdmin
        .from("profiles")
        .select("id, full_name, referral_code, referred_by_user_id, created_at")
        .in("referred_by_user_id", directIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (secondError) throw new Error(secondError.message);

  const secondLevelReferrals = (secondRows ?? []) as ReferralProfile[];

  const { data: commissionRows, error: commissionError } = await supabaseAdmin
    .from("referral_commissions")
    .select(
      "id, order_id, buyer_id, beneficiary_user_id, referral_level, commission_percentage, order_amount_cents, commission_amount_cents, status, created_at",
    )
    .eq("beneficiary_user_id", userId)
    .order("created_at", { ascending: false });
  if (commissionError) throw new Error(commissionError.message);

  const commissions = (commissionRows ?? []) as ReferralCommission[];
  const orderMap = mapById(await fetchOrdersByIds(unique(commissions.map((row) => row.order_id))));
  const buyerMap = mapById(await fetchProfilesByIds(unique(commissions.map((row) => row.buyer_id))));
  const activeBuyerIds = unique(
    commissions
      .filter((commission) => commission.status !== "cancelled")
      .map((commission) => commission.buyer_id),
  );

  return {
    profile: profile as ReferralProfile,
    stats: {
      totalReferrals: directReferrals.length + secondLevelReferrals.length,
      directReferrals: directReferrals.length,
      secondLevelReferrals: secondLevelReferrals.length,
      activeReferrals: activeBuyerIds.length,
      ordersGenerated: unique(
        commissions
          .filter((commission) => commission.status !== "cancelled")
          .map((commission) => commission.order_id),
      ).length,
      pendingEarningsCents: sumByStatus(commissions, "pending"),
      approvedEarningsCents: sumByStatus(commissions, "approved"),
      paidEarningsCents: sumByStatus(commissions, "paid"),
      lifetimeEarningsCents: commissions
        .filter((commission) => commission.status !== "cancelled")
        .reduce((total, commission) => total + commission.commission_amount_cents, 0),
    },
    tree: directReferrals.map((direct) => ({
      ...direct,
      children: secondLevelReferrals.filter((row) => row.referred_by_user_id === direct.id),
    })),
    history: commissions.map((commission) => {
      const order = orderMap.get(commission.order_id);
      const buyer = buyerMap.get(commission.buyer_id);
      return {
        id: commission.id,
        date: commission.created_at,
        buyerId: commission.buyer_id,
        buyerName: displayName(buyer),
        orderId: commission.order_id,
        orderNumber: order?.order_number ?? "Unknown",
        orderAmountCents: commission.order_amount_cents,
        referralLevel: commission.referral_level,
        percentage: commission.commission_percentage,
        commissionCents: commission.commission_amount_cents,
        status: commission.status,
      };
    }),
  };
});

const adminReferralQuerySchema = z.object({
  search: z.string().trim().max(100).optional().default(""),
  status: z.union([commissionStatusSchema, z.literal("all")]).optional().default("all"),
  referralLevel: z.enum(["all", "1", "2"]).optional().default("all"),
  dateFrom: z.string().trim().optional().default(""),
  dateTo: z.string().trim().optional().default(""),
});

export const getAdminReferralManagement = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => adminReferralQuerySchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const search = data.search.trim();
    let usersQuery = supabaseAdmin
      .from("profiles")
      .select("id, full_name, referral_code, referred_by_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (search) {
      const safeSearch = search.replace(/[%,]/g, "");
      usersQuery = usersQuery.or(
        `full_name.ilike.%${safeSearch}%,referral_code.ilike.%${safeSearch}%`,
      );
    }

    const { data: userRows, error: usersError } = await usersQuery;
    if (usersError) throw new Error(usersError.message);

    const { data: hierarchyRows, error: hierarchyError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, referral_code, referred_by_user_id, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (hierarchyError) throw new Error(hierarchyError.message);

    let commissionsQuery = supabaseAdmin
      .from("referral_commissions")
      .select(
        "id, order_id, buyer_id, beneficiary_user_id, referral_level, commission_percentage, order_amount_cents, commission_amount_cents, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.status !== "all") commissionsQuery = commissionsQuery.eq("status", data.status);
    if (data.referralLevel !== "all") {
      commissionsQuery = commissionsQuery.eq("referral_level", Number(data.referralLevel));
    }
    if (data.dateFrom) commissionsQuery = commissionsQuery.gte("created_at", data.dateFrom);
    if (data.dateTo) commissionsQuery = commissionsQuery.lte("created_at", data.dateTo);

    const { data: commissionRows, error: commissionsError } = await commissionsQuery;
    if (commissionsError) throw new Error(commissionsError.message);

    const users = (userRows ?? []) as ReferralProfile[];
    const hierarchyProfiles = (hierarchyRows ?? []) as ReferralProfile[];
    const commissions = (commissionRows ?? []) as ReferralCommission[];
    const profileIds = unique([
      ...users.map((row) => row.id),
      ...hierarchyProfiles.map((row) => row.id),
      ...commissions.map((row) => row.buyer_id),
      ...commissions.map((row) => row.beneficiary_user_id),
    ]);
    const allProfiles = mapById(await fetchProfilesByIds(profileIds));
    users.forEach((user) => allProfiles.set(user.id, user));
    hierarchyProfiles.forEach((user) => allProfiles.set(user.id, user));

    const orderMap = mapById(await fetchOrdersByIds(unique(commissions.map((row) => row.order_id))));
    const directCounts = hierarchyProfiles.reduce<Record<string, number>>((acc, user) => {
      if (user.referred_by_user_id) {
        acc[user.referred_by_user_id] = (acc[user.referred_by_user_id] ?? 0) + 1;
      }
      return acc;
    }, {});
    const earningsByUser = commissions.reduce<Record<string, number>>((acc, commission) => {
      if (commission.status !== "cancelled") {
        acc[commission.beneficiary_user_id] =
          (acc[commission.beneficiary_user_id] ?? 0) + commission.commission_amount_cents;
      }
      return acc;
    }, {});

    return {
      users: users.map((user) => ({
        id: user.id,
        fullName: displayName(user),
        referralCode: user.referral_code,
        referredByUserId: user.referred_by_user_id,
        referredByName: displayName(
          user.referred_by_user_id ? allProfiles.get(user.referred_by_user_id) : undefined,
        ),
        directReferralCount: directCounts[user.id] ?? 0,
        totalEarnedCents: earningsByUser[user.id] ?? 0,
        createdAt: user.created_at,
      })),
      profiles: [...allProfiles.values()].map((profile) => ({
        id: profile.id,
        fullName: displayName(profile),
        referralCode: profile.referral_code,
        referredByUserId: profile.referred_by_user_id,
        createdAt: profile.created_at,
      })),
      stats: {
        pendingCount: commissions.filter((row) => row.status === "pending").length,
        pendingCents: sumByStatus(commissions, "pending"),
        approvedCents: sumByStatus(commissions, "approved"),
        paidCents: sumByStatus(commissions, "paid"),
        cancelledCount: commissions.filter((row) => row.status === "cancelled").length,
      },
      commissions: commissions.map((commission) => {
        const order = orderMap.get(commission.order_id);
        const buyer = allProfiles.get(commission.buyer_id);
        const beneficiary = allProfiles.get(commission.beneficiary_user_id);
        return {
          id: commission.id,
          date: commission.created_at,
          buyerName: displayName(buyer),
          beneficiaryName: displayName(beneficiary),
          beneficiaryCode: beneficiary?.referral_code ?? "",
          orderNumber: order?.order_number ?? "Unknown",
          orderAmountCents: commission.order_amount_cents,
          referralLevel: commission.referral_level,
          percentage: commission.commission_percentage,
          commissionCents: commission.commission_amount_cents,
          status: commission.status,
        };
      }),
    };
  });

const updateCommissionStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "paid", "cancelled"]),
});

export const updateReferralCommissionStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateCommissionStatusSchema.parse(input))
  .handler(async ({ data }) => {
    await requireAdmin();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["referral_commissions"]["Update"] = {
      status: data.status,
      ...(data.status === "approved" ? { approved_at: now } : {}),
      ...(data.status === "paid" ? { approved_at: now, paid_at: now } : {}),
      ...(data.status === "cancelled" ? { cancelled_at: now } : {}),
    };

    const { error } = await supabaseAdmin
      .from("referral_commissions")
      .update(patch)
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
