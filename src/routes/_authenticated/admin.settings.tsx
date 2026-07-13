import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStoreSettings, updateStoreSettings } from "@/lib/settings.functions";

type SettingsForm = {
  storeName: string;
  supportEmail: string;
  supportPhone: string;
  taxRatePercent: number;
  deliveryChargeRupees: number;
  freeDeliveryThresholdRupees: number;
};

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({ meta: [{ title: "Store settings - FEABazaar" }] }),
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettings(),
  });

  const [form, setForm] = useState<SettingsForm | null>(null);

  useEffect(() => {
    if (data && !form) {
      setForm({
        storeName: data.storeName,
        supportEmail: data.supportEmail ?? "",
        supportPhone: data.supportPhone ?? "",
        taxRatePercent: data.taxRateBps / 100,
        deliveryChargeRupees: data.deliveryChargeCents / 100,
        freeDeliveryThresholdRupees: data.freeDeliveryThresholdCents / 100,
      });
    }
  }, [data, form]);

  const mutation = useMutation({
    mutationFn: (input: SettingsForm) =>
      updateStoreSettings({
        data: {
          storeName: input.storeName,
          supportEmail: input.supportEmail || null,
          supportPhone: input.supportPhone || null,
          taxRatePercent: input.taxRatePercent,
          deliveryChargeRupees: input.deliveryChargeRupees,
          freeDeliveryThresholdRupees: input.freeDeliveryThresholdRupees,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Store settings saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  return (
    <AdminPageFrame
      title="Store settings"
      description="Tax, delivery charges, and store contact details used across checkout."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Settings could not load."}
        </div>
      ) : isLoading || !form ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <form
          className="max-w-2xl space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(form);
          }}
        >
          <section className="rounded-md border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-xl font-semibold">Store details</h2>
            <div className="mt-4 grid gap-4">
              <Field label="Store name">
                <Input
                  value={form.storeName}
                  onChange={(e) => setForm({ ...form, storeName: e.target.value })}
                  required
                  maxLength={100}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Support email">
                  <Input
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                    placeholder="help@store.com"
                  />
                </Field>
                <Field label="Support phone">
                  <Input
                    value={form.supportPhone}
                    onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                    placeholder="+91…"
                    maxLength={30}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-md border border-border bg-card p-5 shadow-sm">
            <h2 className="font-display text-xl font-semibold">Checkout pricing</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Applied to every new order. Existing orders keep the values they were placed with.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Tax rate (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.taxRatePercent}
                  onChange={(e) => setForm({ ...form, taxRatePercent: Number(e.target.value) })}
                  required
                />
              </Field>
              <Field label="Delivery charge (₹)">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={form.deliveryChargeRupees}
                  onChange={(e) =>
                    setForm({ ...form, deliveryChargeRupees: Number(e.target.value) })
                  }
                  required
                />
              </Field>
              <Field label="Free delivery over (₹)">
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={form.freeDeliveryThresholdRupees}
                  onChange={(e) =>
                    setForm({ ...form, freeDeliveryThresholdRupees: Number(e.target.value) })
                  }
                  required
                />
              </Field>
            </div>
          </section>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save settings"}
          </Button>
        </form>
      )}
    </AdminPageFrame>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
