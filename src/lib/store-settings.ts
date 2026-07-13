import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type StoreSettings = {
  storeName: string;
  supportEmail: string | null;
  supportPhone: string | null;
  taxRateBps: number;
  deliveryChargeCents: number;
  freeDeliveryThresholdCents: number;
};

// Mirrors the DB defaults in 20260712120000_store_settings.sql. Used as a
// fallback if the settings row is missing so checkout never breaks.
export const SETTINGS_DEFAULTS: StoreSettings = {
  storeName: "FEABazaar",
  supportEmail: null,
  supportPhone: null,
  taxRateBps: 500,
  deliveryChargeCents: 4000,
  freeDeliveryThresholdCents: 49900,
};

/**
 * Reads the singleton store-settings row using whichever Supabase client the
 * caller has (public / user-scoped / admin). Falls back to SETTINGS_DEFAULTS
 * on a missing row OR any read error (e.g. the migration has not been applied
 * yet) so cart/checkout keep working with the built-in defaults.
 * Isomorphic: no server-only imports, so it is safe to share anywhere.
 */
export async function fetchStoreSettings(client: SupabaseClient<Database>): Promise<StoreSettings> {
  try {
    const { data, error } = await client
      .from("store_settings")
      .select(
        "store_name, support_email, support_phone, tax_rate_bps, delivery_charge_cents, free_delivery_threshold_cents",
      )
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[store-settings] falling back to defaults:", error.message);
      return SETTINGS_DEFAULTS;
    }
    if (!data) return SETTINGS_DEFAULTS;
    return {
      storeName: data.store_name,
      supportEmail: data.support_email,
      supportPhone: data.support_phone,
      taxRateBps: data.tax_rate_bps,
      deliveryChargeCents: data.delivery_charge_cents,
      freeDeliveryThresholdCents: data.free_delivery_threshold_cents,
    };
  } catch (err) {
    console.warn("[store-settings] falling back to defaults:", err);
    return SETTINGS_DEFAULTS;
  }
}
