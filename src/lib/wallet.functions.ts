import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

async function getUserId() {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data } = await supabase.auth.getUser(auth.slice(7));
  return data.user?.id ?? null;
}

export async function computeWalletBalance(userId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_wallet_balance", { _user_id: userId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export const getWalletBalance = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await getUserId();
  if (!userId) return { balanceCents: 0, signedIn: false };
  const balanceCents = await computeWalletBalance(userId);
  return { balanceCents, signedIn: true };
});
