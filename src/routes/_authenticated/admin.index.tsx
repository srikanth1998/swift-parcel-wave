import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Boxes, IndianRupee, PackageCheck, ShoppingBag } from "lucide-react";
import type { ComponentType } from "react";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminOverview } from "@/lib/admin.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/order-status";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Back office - FEABazaar" }] }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => getAdminOverview(),
  });

  if (error) {
    return (
      <AdminPageFrame title="Back office" description="Operational controls for FEABazaar.">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Back office could not load."}
        </div>
      </AdminPageFrame>
    );
  }

  return (
    <AdminPageFrame title="Back office" description="Monitor orders, catalog health, and daily operations.">
      {isLoading || !data ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={ShoppingBag} label="Orders 30d" value={data.stats.orders30d} />
            <Metric icon={PackageCheck} label="Open orders" value={data.stats.pendingOrders} />
            <Metric icon={IndianRupee} label="Revenue 30d" value={formatCents(data.stats.revenue30dCents)} />
            <Metric icon={AlertTriangle} label="Low stock" value={data.stats.lowStockProducts} />
            <Metric icon={Boxes} label="Inactive SKUs" value={data.stats.inactiveProducts} />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Recent Orders</h2>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/orders">Open queue</Link>
                </Button>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          No recent orders.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.recentOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <div className="font-medium">{order.order_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), "MMM d, h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell>{STATUS_LABEL[order.order_status]}</TableCell>
                          <TableCell className="capitalize">{order.payment_status}</TableCell>
                          <TableCell className="text-right font-medium">{formatCents(order.total)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-semibold">Low Stock</h2>
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/products">Manage catalog</Link>
                </Button>
              </div>
              <div className="mt-4 space-y-2">
                {data.lowStockProducts.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Stock levels look healthy.
                  </div>
                ) : (
                  data.lowStockProducts.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{formatCents(product.price_cents)}</div>
                      </div>
                      <div className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                        {product.stock_qty} left
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
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
