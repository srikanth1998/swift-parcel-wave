import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getOrderByNumber } from "@/lib/orders.functions";
import { formatCents } from "@/lib/format";
import { CUSTOMER_TIMELINE, STATUS_LABEL, type OrderStatus } from "@/lib/order-status";
import { Check, CircleDot, Package, Truck } from "lucide-react";
import { Reveal } from "@/components/reveal";

const STATUS_STYLE: Record<OrderStatus, string> = {
  order_placed: "bg-gray-100 text-gray-700 border-gray-200",
  payment_confirmed: "bg-blue-100 text-blue-700 border-blue-200",
  order_confirmed: "bg-purple-100 text-purple-700 border-purple-200",
  picking_items: "bg-orange-100 text-orange-700 border-orange-200",
  packing: "bg-yellow-100 text-yellow-800 border-yellow-200",
  ready_for_delivery: "bg-emerald-100 text-emerald-700 border-emerald-200",
  sent_for_delivery: "bg-emerald-600 text-white border-emerald-700",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  refunded: "bg-pink-100 text-pink-700 border-pink-200",
};

const orderSearchSchema = z.object({
  accessToken: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

export const Route = createFileRoute("/order/$orderNumber")({
  validateSearch: orderSearchSchema,
  loaderDeps: ({ search }) => ({ accessToken: search.accessToken }),
  loader: async ({ context, params, deps }) => {
    const order = await context.queryClient.ensureQueryData({
      queryKey: ["order", params.orderNumber, deps.accessToken],
      queryFn: () =>
        getOrderByNumber({
          data: { orderNumber: params.orderNumber, accessToken: deps.accessToken },
        }),
    });
    // Keep the generic secure-link prompt routable without revealing whether
    // a guest order number exists.
    if (!order) throw notFound();
  },
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.orderNumber} — FEABazaar` },
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: OrderPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl">Order not found</h1>
      <Link to="/" className="mt-4 inline-block text-primary hover:underline">
        Go home
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl">Something went wrong</h1>
    </div>
  ),
});

function OrderPage() {
  const { orderNumber } = Route.useParams();
  const { accessToken } = Route.useSearch();

  const { data: order } = useQuery({
    queryKey: ["order", orderNumber, accessToken],
    queryFn: () => getOrderByNumber({ data: { orderNumber, accessToken } }),
  });

  if (order && "requiresGuestAccessToken" in order && order.requiresGuestAccessToken) {
    return (
      <div className="bg-muted/30">
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out fill-mode-both rounded-2xl border border-border bg-card p-6 text-center">
            <h1 className="font-display text-xl font-bold">Secure tracking link required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Open the private tracking link shown after checkout. For an older guest order, contact
              support with your order number and checkout email.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">
              <Link to="/auth" className="text-primary hover:underline">
                Sign in
              </Link>{" "}
              to view all your orders without verification.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!order || "requiresGuestAccessToken" in order) return null;

  const status = order.order_status;
  const isCancelled = status === "cancelled" || status === "refunded";
  const currentIdx = CUSTOMER_TIMELINE.indexOf(status as (typeof CUSTOMER_TIMELINE)[number]);
  const addr = order.delivery_addresses;

  return (
    <div className="bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out fill-mode-both rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Order</div>
              <h1 className="font-display text-2xl font-bold">{order.order_number}</h1>
            </div>
            <div
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${STATUS_STYLE[status]}`}
            >
              {STATUS_LABEL[status]}
            </div>
          </div>

          {status === "sent_for_delivery" && (
            <div className="mt-4 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <Truck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Your order is out for delivery</div>
                <div className="text-emerald-700/90">
                  Your FEABazaar order has been packed and handed to our delivery partner.
                </div>
              </div>
            </div>
          )}

          {!isCancelled && (
            <ol className="mt-8 space-y-4">
              {CUSTOMER_TIMELINE.map((s, idx) => {
                const done = idx < currentIdx;
                const current = idx === currentIdx;
                return (
                  <Reveal key={s} as="li" index={idx} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                        done
                          ? "bg-primary text-primary-foreground"
                          : current
                            ? "bg-accent text-accent-foreground animate-in zoom-in-50 duration-300 ease-out fill-mode-both"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : current ? (
                        <CircleDot className="h-3.5 w-3.5" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div
                      className={`text-sm ${current ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {STATUS_LABEL[s]}
                    </div>
                  </Reveal>
                );
              })}
            </ol>
          )}
          {isCancelled && (
            <div className="mt-6 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              This order was {STATUS_LABEL[status].toLowerCase()}.
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
              <Package className="h-5 w-5" /> Items
            </h2>
            <ul className="divide-y divide-border">
              {order.items.map((it) => (
                <li key={it.id} className="flex justify-between gap-2 py-2 text-sm">
                  <span>
                    {it.ordered_qty} × {it.name_snapshot}
                  </span>
                  <span className="font-medium">
                    {formatCents(it.unit_price_cents * it.ordered_qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCents(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount{order.coupon_code ? ` (${order.coupon_code})` : ""}</span>
                  <span>−{formatCents(order.discount)}</span>
                </div>
              )}
              {order.wallet_credit_cents > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Wallet credit</span>
                  <span>−{formatCents(order.wallet_credit_cents)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCents(order.tax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span>
                  {order.delivery_charge === 0 ? "Free" : formatCents(order.delivery_charge)}
                </span>
              </div>
              <div className="flex justify-between pt-2 text-base font-semibold">
                <span>Total</span>
                <span>{formatCents(order.total)}</span>
              </div>
              <div className="pt-2 text-xs text-muted-foreground">
                Payment: Cash on Delivery · {order.payment_status}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 font-display text-lg font-semibold">Delivery address</h2>
            {addr && (
              <div className="text-sm text-foreground">
                <div className="font-medium">{addr.full_name}</div>
                <div className="text-muted-foreground">{addr.phone}</div>
                <div className="mt-2">
                  {addr.line1}
                  {addr.line2 ? `, ${addr.line2}` : ""}
                  <br />
                  {addr.city}, {addr.state} {addr.zip}
                </div>
                {addr.instructions && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    <span className="font-medium">Instructions:</span> {addr.instructions}
                  </div>
                )}
              </div>
            )}
            {order.customer_notes && (
              <div className="mt-4 rounded-lg bg-secondary/60 p-3 text-xs">
                <div className="font-medium">Order notes</div>
                <div className="text-muted-foreground">{order.customer_notes}</div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
