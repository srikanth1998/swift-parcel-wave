import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMyOrders } from "@/lib/orders.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/order-status";
import { Package } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({ meta: [{ title: "My orders — FEA Bazar" }] }),
  component: MyOrders,
});

function MyOrders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => getMyOrders(),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold">My orders</h1>
      {isLoading ? (
        <div className="mt-8 text-muted-foreground">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="mt-16 rounded-2xl border border-border bg-card p-12 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">You don't have any orders yet.</p>
          <Link to="/shop" className="mt-4 inline-block font-medium text-primary hover:underline">Start shopping →</Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                to="/order/$orderNumber"
                params={{ orderNumber: o.order_number }}
                className="flex items-center justify-between gap-4 p-4 hover:bg-secondary/40"
              >
                <div>
                  <div className="font-medium">{o.order_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(o.created_at), "MMM d, yyyy · h:mm a")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{formatCents(o.total)}</div>
                  <div className="text-xs text-primary">{STATUS_LABEL[o.order_status]}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
