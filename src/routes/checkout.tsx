import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";
import { placeOrder } from "@/lib/orders.functions";
import { getStoreSettings } from "@/lib/settings.functions";
import { validateCoupon } from "@/lib/coupons.functions";
import { getWalletBalance } from "@/lib/wallet.functions";
import { listMyAddresses } from "@/lib/profile.functions";
import { PincodeInput } from "@/components/pincode-input";
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
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — FEABazaar" }] }),
  component: Checkout,
});

function createGuestAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function Checkout() {
  const { items, subtotalCents, hydrated, clear } = useCart();
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const placeOrderFn = useServerFn(placeOrder);
  const validateCouponFn = useServerFn(validateCoupon);
  const [submitting, setSubmitting] = useState(false);
  const submissionSecrets = useRef<{
    idempotencyKey: string;
    guestAccessToken: string;
  } | null>(null);
  // Guards the fast-double-click case specifically: setSubmitting only takes
  // effect after a re-render, which two clicks in the same tick can beat.
  // submissionSecrets already makes a *retried* submit idempotent server-side;
  // this stops a second click from firing a second request at all.
  const submitLock = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettings(),
  });
  const { data: wallet } = useQuery({
    queryKey: ["wallet-balance", user?.id ?? "guest"],
    queryFn: () => getWalletBalance(),
    enabled: !!user,
  });
  const walletBalance = wallet?.balanceCents ?? 0;
  const [useWallet, setUseWallet] = useState(false);
  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["my-addresses", user?.id ?? "guest"],
    queryFn: () => listMyAddresses(),
    enabled: !!user,
  });
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
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
      "replace_similar" | "refund_if_unavailable" | "contact_me",
  });

  useEffect(() => {
    if (user?.email && !form.email) setForm((f) => ({ ...f, email: user.email ?? "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-select default (or first) saved address and prefill form.
  useEffect(() => {
    if (!savedAddresses.length) return;
    const chosen =
      savedAddresses.find((a) => a.id === selectedAddressId) ||
      savedAddresses.find((a) => a.is_default) ||
      savedAddresses[0];
    if (!chosen) return;
    if (!selectedAddressId) setSelectedAddressId(chosen.id);
    setForm((f) => ({
      ...f,
      fullName: chosen.full_name,
      email: chosen.email,
      phone: chosen.phone,
      line1: chosen.line1,
      line2: chosen.line2 ?? "",
      city: chosen.city,
      state: chosen.state,
      zip: chosen.zip,
      deliveryInstructions: chosen.instructions ?? "",
    }));
  }, [savedAddresses, selectedAddressId]);

  useEffect(() => {
    if (hydrated && items.length === 0) navigate({ to: "/cart" });
  }, [hydrated, items.length, navigate]);

  if (!hydrated || items.length === 0) return <div className="mx-auto max-w-4xl px-4 py-16" />;

  const discount = Math.min(coupon?.discountCents ?? 0, subtotalCents);
  const taxableBase = Math.max(subtotalCents - discount, 0);
  const walletApplied = useWallet && user ? Math.min(walletBalance, taxableBase) : 0;
  const afterWallet = Math.max(taxableBase - walletApplied, 0);
  const tax = Math.round((afterWallet * taxRateBps) / 10000);
  const deliveryCharge = subtotalCents >= freeThresholdCents ? 0 : deliveryChargeCents;
  const total = afterWallet + tax + deliveryCharge;

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
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      // Keep both values stable across a network retry. The guest token has
      // 256 bits of entropy and only its SHA-256 hash is stored in the DB.
      submissionSecrets.current ??= {
        idempotencyKey: crypto.randomUUID(),
        guestAccessToken: createGuestAccessToken(),
      };
      const { idempotencyKey, guestAccessToken } = submissionSecrets.current;
      const result = await placeOrderFn({
        data: {
          ...form,
          line2: form.line2 || null,
          deliveryInstructions: form.deliveryInstructions || null,
          customerNotes: form.customerNotes || null,
          couponCode: coupon?.code ?? null,
          walletCreditCents: walletApplied,
          items: items.map((i) => ({ productId: i.productId, qty: i.qty })),
          idempotencyKey,
          guestAccessToken,
        },
      });
      toast.success("Order placed!");
      // H2 FIX: Navigate BEFORE clearing cart to prevent the empty-cart guard
      // from winning the navigation race. The order confirmation page will
      // show the order details, and clearing the cart afterwards is safe.
      await navigate({
        to: "/order/$orderNumber",
        params: { orderNumber: result.orderNumber },
        search: result.accessToken ? { accessToken: result.accessToken } : {},
      });
      // Clear cart after navigation completes
      clear();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to place order");
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid max-w-5xl animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out gap-8 px-4 py-8 md:grid-cols-[1fr_340px]"
    >
      <div className="space-y-8">
        <h1 className="font-display text-3xl font-semibold">Checkout</h1>

        {user && savedAddresses.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">
                <MapPin className="mr-1 inline h-4 w-4 text-primary" />
                Deliver to
              </h2>
              <Link to="/profile" className="text-xs font-medium text-primary hover:underline">
                Manage addresses
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {savedAddresses.map((a) => (
                <label
                  key={a.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                    selectedAddressId === a.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="saved-address"
                    className="mt-1"
                    checked={selectedAddressId === a.id}
                    onChange={() => setSelectedAddressId(a.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.label || a.full_name}</span>
                      {a.is_default && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {a.full_name} · {a.phone}
                    </div>
                    <div className="text-muted-foreground">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.zip}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              You can adjust the details below before placing the order.
            </p>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Contact</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Full name" required>
              {(id) => (
                <Input
                  id={id}
                  required
                  autoComplete="name"
                  maxLength={100}
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              )}
            </Field>
            <Field label="Phone number" required>
              {(id) => (
                <Input
                  id={id}
                  required
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              )}
            </Field>
            <Field label="Email address" required className="md:col-span-2">
              {(id) => (
                <Input
                  id={id}
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Delivery address</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Street address" required className="md:col-span-2">
              {(id) => (
                <Input
                  id={id}
                  required
                  autoComplete="address-line1"
                  maxLength={200}
                  value={form.line1}
                  onChange={(e) => setForm({ ...form, line1: e.target.value })}
                />
              )}
            </Field>
            <Field label="Apartment or unit (optional)" className="md:col-span-2">
              {(id) => (
                <Input
                  id={id}
                  autoComplete="address-line2"
                  maxLength={100}
                  value={form.line2}
                  onChange={(e) => setForm({ ...form, line2: e.target.value })}
                />
              )}
            </Field>
            <Field label="City" required>
              {(id) => (
                <Input
                  id={id}
                  required
                  autoComplete="address-level2"
                  maxLength={100}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              )}
            </Field>
            <Field label="State" required>
              {(id) => (
                <Input
                  id={id}
                  required
                  autoComplete="address-level1"
                  maxLength={60}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              )}
            </Field>
            <Field label="PIN code" required>
              {(id) => (
                <PincodeInput
                  id={id}
                  required
                  value={form.zip}
                  onChange={(zip) => setForm({ ...form, zip })}
                />
              )}
            </Field>
            <Field label="Delivery instructions" className="md:col-span-2">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g., Leave at the front door"
                  value={form.deliveryInstructions}
                  onChange={(e) => setForm({ ...form, deliveryInstructions: e.target.value })}
                />
              )}
            </Field>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-semibold">Preferences</h2>
          <div className="mt-4 grid gap-4">
            {/* Not a form control — a static statement of the only payment
                method, so it needs no label association. */}
            <div>
              <span className="mb-1.5 block text-sm font-medium">Payment method</span>
              <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                Cash on Delivery
              </div>
            </div>
            <Field label="If an item is unavailable">
              {(id) => (
                <Select
                  value={form.substitutionPreference}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      substitutionPreference: v as typeof form.substitutionPreference,
                    })
                  }
                >
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace_similar">Replace with a similar item</SelectItem>
                    <SelectItem value="refund_if_unavailable">Refund the item</SelectItem>
                    <SelectItem value="contact_me">Contact me first</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Order notes (optional)">
              {(id) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={500}
                  placeholder="Anything else we should know?"
                  value={form.customerNotes}
                  onChange={(e) => setForm({ ...form, customerNotes: e.target.value })}
                />
              )}
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
                aria-label="Coupon code"
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
        {user && walletBalance > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={useWallet}
                onChange={(e) => setUseWallet(e.target.checked)}
              />
              <span className="flex-1">
                <span className="font-medium">Use referral wallet</span>
                <span className="ml-1 text-muted-foreground">
                  ({formatCents(walletBalance)} available)
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Applied to item total. Cannot cover tax or delivery.
                </span>
              </span>
            </label>
          </div>
        )}
        {walletApplied > 0 && (
          <div className="mt-2 flex justify-between text-sm text-emerald-700">
            <span>Wallet credit</span>
            <span>−{formatCents(walletApplied)}</span>
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
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Placing order…
            </>
          ) : (
            "Place order"
          )}
        </Button>
      </aside>
    </form>
  );
}

/**
 * Labels a single form control.
 *
 * `children` is called with an id that must be spread onto the control, so the
 * <label> and the input are programmatically associated. Previously this
 * rendered a bare <Label> next to an id-less <Input>, which left every control
 * on this page announcing as unlabeled to screen readers.
 */
function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5 block text-sm">
        {label}
        {required && <span className="text-accent"> *</span>}
      </Label>
      {children(id)}
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
