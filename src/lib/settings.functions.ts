import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { fetchStoreSettings } from "./store-settings";

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

async function requireAdminUser() {
  const supabase = userScopedClient();
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Error("Unauthorized");
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new Error("Unauthorized");
  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: data.user.id,
    _role: "admin",
  });
  if (roleError || !isAdmin) throw new Error("Admin access required");
  return { userId: data.user.id };
}

export const getStoreSettings = createServerFn({ method: "GET" }).handler(async () => {
  return fetchStoreSettings(publicClient());
});

const updateSettingsSchema = z.object({
  storeName: z.string().trim().min(1).max(100),
  supportEmail: z.string().trim().email().max(255).or(z.literal("")).nullable().optional(),
  supportPhone: z.string().trim().max(30).or(z.literal("")).nullable().optional(),
  taxRatePercent: z.number().min(0).max(100),
  deliveryChargeRupees: z.number().min(0).max(100000),
  freeDeliveryThresholdRupees: z.number().min(0).max(1000000),
});

export const updateStoreSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => updateSettingsSchema.parse(input))
  .handler(async ({ data }) => {
    const { userId } = await requireAdminUser();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("store_settings")
      .update({
        store_name: data.storeName,
        support_email: data.supportEmail || null,
        support_phone: data.supportPhone || null,
        tax_rate_bps: Math.round(data.taxRatePercent * 100),
        delivery_charge_cents: Math.round(data.deliveryChargeRupees * 100),
        free_delivery_threshold_cents: Math.round(data.freeDeliveryThresholdRupees * 100),
        updated_by: userId,
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
