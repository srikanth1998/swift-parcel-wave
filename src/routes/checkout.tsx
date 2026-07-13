import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";
import { placeOrder } from "@/lib/orders.functions";
import { getStoreSettings } from "@/lib/settings.functions";
import { validateCoupon } from "@/lib/coupons.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — FEABazaar" }] }),
  component: Checkout,
});

function Checkout() {
  const { items, subtotalCents, hydrated, clear } = useCart();
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const placeOrderFn = useServerFn(placeOrder);
  const validateCouponFn = useServerFn(validateCoupon);
  const [submitting, setSubmitting] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettings(),
  });
  const taxRateBps = settings?.taxRateBps ?? 500;
  const deliveryChargeCents = settings?.deliveryChargeCents ?? 4000;
  const freeThresholdCents = settings?.freeDeliveryThresholdCents ?? 49900;

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discountCents: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    zip: "",
    deliveryInstructions: "",
    customerNotes: "",
    substitutionPreference: "replace_similar" as
      | "replace_similar"
      | "refund_if_unavailable"
      | "contact_me",
  });

  useEffect(() => {
    if (user?.email && !form.email) setForm((f) => ({ ...f, email: user.email ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (hydrated && items.length === 0) navigate({ to: "/cart" });
  }, [hydrated, items.length, navigate]);

  if (!hydrated || items.length === 0) return <div className="mx-auto max-w-4xl px-4 py-16" />;

  const discount = Math.min(coupon?.discountCents ?? 0, subtotalCents);
  const taxableBase = Math.max(subtotalCents - discount, 0);
  const tax = Math.round((taxableBase * taxRateBps) / 10000);
  const deliveryCharge = subtotalCents >= freeThresholdCents ? 0 : deliveryChargeCents;
  const total = taxableBase + tax + deliveryCharge;

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const result = await validateCouponFn({ data: { code, subtotalCents } });
      if (result.ok) {
        setCoupon({ code: result.code, discountCents: result.discountCents });
        setCouponError(null);
      } else {
        setCoupon(null);
        setCouponError(result.reason);
      }
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : "Could not check that coupon.");
    } finally {
      setCouponChecking(false);
    }
  };

  const removeCoupon = () => {
    setCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await placeOrderFn({
        data: {
          ...form,
          line2: form.line2 || null,
          deliveryInstructions: form.deliveryInstructions || null,
          customerNotes: form.customerNotes || null,
          couponCode: coupon?.code ?? null,
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
        },
      });
      clear();
      toast.success("Order placed!");
      navigate({ to: "/order/$orderNumber", params: { orderNumber: result.orderNumber } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to place order");
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_340px]"
    >
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-semibold">Checkout</h1>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Full name" required>
              <Input
                required
                maxLength={100}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Field>
            <Field label="Phone number" required>
              <Input
                required
                maxLength={30}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Email address" required className="md:col-span-2">
              <Input
                required
                type="email"
                maxLength={255}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Delivery address</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Street address" required className="md:col-span-2">
              <Input
                required
                maxLength={200}
                value={form.line1}
                onChange={(e) => setForm({ ...form, line1: e.target.value })}
              />
            </Field>
            <Field label="Apartment or unit (optional)" className="md:col-span-2">
              <Input
                maxLength={100}
                value={form.line2}
                onChange={(e) => setForm({ ...form, line2: e.target.value })}
              />
            </Field>
            <Field label="City" required>
              <Input
                required
                maxLength={100}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </Field>
            <Field label="State" required>
              <Input
                required
                maxLength={60}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </Field>
            <Field label="PIN code" required>
              <Input
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="6-digit PIN"
                value={form.zip}
                onChange={(e) => setForm({ ...form, zip: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="Delivery instructions" className="md:col-span-2">
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="e.g., Leave at the front door"
                value={form.deliveryInstructions}
                onChange={(e) => setForm({ ...form, deliveryInstructions: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Preferences</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Payment method">
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                Cash on Delivery
              </div>
            </Field>
            <Field label="If an item is unavailable">
              <Select
                value={form.substitutionPreference}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    substitutionPreference: v as typeof form.substitutionPreference,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="replace_similar">Replace with a similar item</SelectItem>
                  <SelectItem value="refund_if_unavailable">Refund the item</SelectItem>
                  <SelectItem value="contact_me">Contact me first</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Order notes (optional)">
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Anything else we should know?"
                value={form.customerNotes}
                onChange={(e) => setForm({ ...form, customerNotes: e.target.value })}
              />
            </Field>
          </div>
        </section>

        {!user && (
          <div className="rounded-lg bg-secondary/60 p-4 text-sm text-muted-foreground">
            Ordering as a guest.{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to track this and future orders.
          </div>
        )}
      </div>

      <aside className="h-fit rounded-2xl border border-border bg-card p-6 md:sticky md:top-24">
        <h2 className="font-display text-lg font-semibold">Order summary</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.productId} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                {i.qty} × {i.name}
              </span>
              <span className="font-medium whitespace-nowrap">
                {formatCents(i.priceCents * i.qty)}
              </span>
            </li>
          ))}
        </ul>
        <div className="my-4 h-px bg-border" />

        <div>
          {coupon ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="font-medium text-emerald-800">
                Coupon <span className="font-mono">{coupon.code}</span> applied
              </span>
              <button
                type="button"
                onClick={removeCoupon}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Coupon code"
                maxLength={40}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={applyCoupon}
                disabled={couponChecking || !couponInput.trim()}
              >
                {couponChecking ? "…" : "Apply"}
              </Button>
            </div>
          )}
          {couponError && <p className="mt-1.5 text-xs text-destructive">{couponError}</p>}
        </div>

        <div className="my-4 h-px bg-border" />
        <Row label="Subtotal" value={formatCents(subtotalCents)} />
        {discount > 0 && (
          <div className="flex justify-between text-sm text-emerald-700">
            <span>Discount</span>
            <span>−{formatCents(discount)}</span>
          </div>
        )}
        <Row label={`GST (${(taxRateBps / 100).toString()}%)`} value={formatCents(tax)} />
        <Row label="Delivery" value={deliveryCharge === 0 ? "Free" : formatCents(deliveryCharge)} />
        {deliveryCharge > 0 && subtotalCents < freeThresholdCents && (
          <p className="pt-1 text-xs text-muted-foreground">
            Add {formatCents(freeThresholdCents - subtotalCents)} more for free delivery.
          </p>
        )}
        <div className="my-4 h-px bg-border" />
        <Row label="Total" value={formatCents(total)} bold />
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={submitting}>
          {submitting ? "Placing order…" : "Place order"}
        </Button>
      </aside>
    </form>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-sm">
        {label}
        {required && <span className="text-accent"> *</span>}
      </Label>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "text-base font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
