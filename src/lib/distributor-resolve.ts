import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ResolvedDistributor = { id: string; name: string };

/**
 * Resolves the distributor that services a given pincode. Coverage is
 * non-overlapping (one distributor per pincode, enforced by a unique
 * constraint on service_areas.pincode).
 *
 * service_areas has no public/authenticated read policy — resolution is a
 * server-only concern, so this must be called with a service-role client.
 */
export async function resolveDistributorForPincode(
  client: SupabaseClient<Database>,
  pincode: string,
): Promise<ResolvedDistributor | null> {
  const { data: area } = await client
    .from("service_areas")
    .select("distributor_id")
    .eq("pincode", pincode)
    .maybeSingle();
  if (!area) return null;

  const { data: distributor } = await client
    .from("distributors")
    .select("id, name, is_active")
    .eq("id", area.distributor_id)
    .maybeSingle();
  if (!distributor || !distributor.is_active) return null;

  return { id: distributor.id, name: distributor.name };
}
