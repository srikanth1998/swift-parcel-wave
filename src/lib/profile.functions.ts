import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const addressSchema = z.object({
  label: z.string().trim().max(40).nullable().optional(),
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
  instructions: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const listMyAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("delivery_addresses")
      .select(
        "id, label, full_name, email, phone, line1, line2, city, state, zip, instructions, is_default, created_at",
      )
      .eq("customer_id", context.userId)
      .eq("is_saved", true)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addressSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.isDefault) {
      await context.supabase
        .from("delivery_addresses")
        .update({ is_default: false })
        .eq("customer_id", context.userId)
        .eq("is_saved", true);
    } else {
      const { count } = await context.supabase
        .from("delivery_addresses")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", context.userId)
        .eq("is_saved", true);
      if (!count) data.isDefault = true;
    }
    const { error } = await context.supabase.from("delivery_addresses").insert({
      customer_id: context.userId,
      label: data.label || null,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone,
      line1: data.line1,
      line2: data.line2 || null,
      city: data.city,
      state: data.state,
      zip: data.zip,
      instructions: data.instructions || null,
      is_default: data.isDefault ?? false,
      is_saved: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const updateSchema = addressSchema.extend({ id: z.string().uuid() });

export const updateMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.isDefault) {
      await context.supabase
        .from("delivery_addresses")
        .update({ is_default: false })
        .eq("customer_id", context.userId)
        .eq("is_saved", true);
    }
    const { error } = await context.supabase
      .from("delivery_addresses")
      .update({
        label: data.label || null,
        full_name: data.fullName,
        email: data.email,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 || null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        instructions: data.instructions || null,
        is_default: data.isDefault ?? false,
      })
      .eq("id", data.id)
      .eq("customer_id", context.userId)
      .eq("is_saved", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("delivery_addresses")
      .select("is_default")
      .eq("id", data.id)
      .eq("customer_id", context.userId)
      .eq("is_saved", true)
      .maybeSingle();
    const { error } = await context.supabase
      .from("delivery_addresses")
      .delete()
      .eq("id", data.id)
      .eq("customer_id", context.userId)
      .eq("is_saved", true);
    if (error) throw new Error(error.message);
    if (existing?.is_default) {
      const { data: next } = await context.supabase
        .from("delivery_addresses")
        .select("id")
        .eq("customer_id", context.userId)
        .eq("is_saved", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (next?.id) {
        await context.supabase
          .from("delivery_addresses")
          .update({ is_default: true })
          .eq("id", next.id);
      }
    }
    return { ok: true };
  });

export const setDefaultAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("delivery_addresses")
      .update({ is_default: false })
      .eq("customer_id", context.userId)
      .eq("is_saved", true);
    const { error } = await context.supabase
      .from("delivery_addresses")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("customer_id", context.userId)
      .eq("is_saved", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, phone, referral_code, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: context.userId,
      email: context.claims?.email ?? null,
      fullName: data?.full_name ?? "",
      phone: data?.phone ?? "",
      referralCode: data?.referral_code ?? "",
      createdAt: data?.created_at ?? null,
    };
  });

const profileSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(30).nullable().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.fullName, phone: data.phone || null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });