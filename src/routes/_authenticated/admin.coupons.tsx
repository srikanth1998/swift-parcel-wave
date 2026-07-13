import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Tag, TicketPercent, Repeat } from "lucide-react";
import { useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminCoupons, setCouponActive, upsertAdminCoupon } from "@/lib/coupons.functions";
import { formatCents } from "@/lib/format";

type CouponType = "percentage" | "fixed";

type CouponForm = {
  id?: string;
  code: string;
  description: string;
  type: CouponType;
  value: number;
  minOrderRupees: number;
  maxDiscountRupees: number;
  usageLimit: number;
  perUserLimit: number;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
};

const emptyCoupon: CouponForm = {
  code: "",
  description: "",
  type: "percentage",
  value: 10,
  minOrderRupees: 0,
  maxDiscountRupees: 0,
  usageLimit: 0,
  perUserLimit: 0,
  startsAt: "",
  expiresAt: "",
  isActive: true,
};

const STATE_BADGE: Record<string, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  disabled: "border-gray-200 bg-gray-50 text-gray-600",
  expired: "border-red-200 bg-red-50 text-red-700",
  exhausted: "border-amber-200 bg-amber-50 text-amber-700",
  scheduled: "border-blue-200 bg-blue-50 text-blue-700",
};

function toInputDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDateTime(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export const Route = createFileRoute("/_authenticated/admin/coupons")({
  head: () => ({ meta: [{ title: "Coupons - FEABazaar" }] }),
  component: AdminCouponsPage,
});

function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CouponForm>(emptyCoupon);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => getAdminCoupons(),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: CouponForm) =>
      upsertAdminCoupon({
        data: {
          id: input.id,
          code: input.code,
          description: input.description || null,
          type: input.type,
          value: input.value,
          minOrderRupees: input.minOrderRupees,
          maxDiscountRupees:
            input.type === "percentage" && input.maxDiscountRupees > 0
              ? input.maxDiscountRupees
              : null,
          usageLimit: input.usageLimit > 0 ? input.usageLimit : null,
          perUserLimit: input.perUserLimit > 0 ? input.perUserLimit : null,
          startsAt: fromInputDateTime(input.startsAt),
          expiresAt: fromInputDateTime(input.expiresAt),
          isActive: input.isActive,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setForm(emptyCoupon);
      toast.success("Coupon saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => setCouponActive({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });

  const describeValue = (type: CouponType, value: number) =>
    type === "percentage" ? `${value}% off` : `${formatCents(value)} off`;

  return (
    <AdminPageFrame title="Coupons" description="Create and manage discount codes for checkout.">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Coupons could not load."}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-3">
            <Metric icon={Tag} label="Coupons" value={data?.stats.total ?? 0} />
            <Metric icon={TicketPercent} label="Active" value={data?.stats.active ?? 0} />
            <Metric icon={Repeat} label="Redemptions" value={data?.stats.redemptions ?? 0} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <section className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">
                  {form.id ? "Edit coupon" : "New coupon"}
                </h2>
                {form.id && (
                  <Button variant="outline" size="sm" onClick={() => setForm(emptyCoupon)}>
                    <Plus />
                    New
                  </Button>
                )}
              </div>
              <form
                className="mt-4 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  upsertMutation.mutate(form);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Code">
                    <Input
                      value={form.code}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="WELCOME10"
                      required
                      minLength={3}
                      maxLength={40}
                    />
                  </Field>
                  <Field label="Type">
                    <Select
                      value={form.type}
                      onValueChange={(value) =>
                        setForm((current) => ({ ...current, type: value as CouponType }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed">Fixed amount</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Field label="Description">
                  <Input
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="10% off your first order"
                    maxLength={200}
                  />
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={form.type === "percentage" ? "Percent off" : "Amount off (₹)"}>
                    <Input
                      type="number"
                      min={form.type === "percentage" ? 1 : 0.01}
                      max={form.type === "percentage" ? 100 : undefined}
                      step={form.type === "percentage" ? 1 : 0.01}
                      value={form.value}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, value: Number(event.target.value) }))
                      }
                      required
                    />
                  </Field>
                  <Field label="Min order (₹)">
                    <Input
                      type="number"
                      min={0}
                      value={form.minOrderRupees}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          minOrderRupees: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                </div>

                {form.type === "percentage" && (
                  <Field label="Max discount cap (₹, 0 = none)">
                    <Input
                      type="number"
                      min={0}
                      value={form.maxDiscountRupees}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          maxDiscountRupees: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Total uses (0 = unlimited)">
                    <Input
                      type="number"
                      min={0}
                      value={form.usageLimit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          usageLimit: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                  <Field label="Per customer (0 = unlimited)">
                    <Input
                      type="number"
                      min={0}
                      value={form.perUserLimit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          perUserLimit: Number(event.target.value),
                        }))
                      }
                    />
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Starts (optional)">
                    <Input
                      type="datetime-local"
                      value={form.startsAt}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, startsAt: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Expires (optional)">
                    <Input
                      type="datetime-local"
                      value={form.expiresAt}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, expiresAt: event.target.value }))
                      }
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
                  />
                  Active
                </label>

                <Button type="submit" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending ? "Saving..." : "Save coupon"}
                </Button>
              </form>
            </section>

            <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Min order</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : (data?.coupons ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        No coupons yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.coupons ?? []).map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell>
                          <div className="font-mono font-medium">{coupon.code}</div>
                          {coupon.description && (
                            <div className="text-xs text-muted-foreground">
                              {coupon.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{describeValue(coupon.type, coupon.value)}</TableCell>
                        <TableCell>
                          {coupon.min_order_cents > 0 ? formatCents(coupon.min_order_cents) : "—"}
                        </TableCell>
                        <TableCell>
                          {coupon.used_count}
                          {coupon.usage_limit != null ? ` / ${coupon.usage_limit}` : ""}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${STATE_BADGE[coupon.state]}`}
                          >
                            {coupon.state}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={coupon.is_active}
                            onCheckedChange={(isActive) =>
                              toggleMutation.mutate({ id: coupon.id, isActive })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setForm({
                                id: coupon.id,
                                code: coupon.code,
                                description: coupon.description ?? "",
                                type: coupon.type,
                                value:
                                  coupon.type === "percentage" ? coupon.value : coupon.value / 100,
                                minOrderRupees: coupon.min_order_cents / 100,
                                maxDiscountRupees:
                                  coupon.max_discount_cents != null
                                    ? coupon.max_discount_cents / 100
                                    : 0,
                                usageLimit: coupon.usage_limit ?? 0,
                                perUserLimit: coupon.per_user_limit ?? 0,
                                startsAt: toInputDateTime(coupon.starts_at),
                                expiresAt: toInputDateTime(coupon.expires_at),
                                isActive: coupon.is_active,
                              })
                            }
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </section>
          </div>
        </div>
      )}
    </AdminPageFrame>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
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
