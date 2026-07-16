import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, IndianRupee, MapPin, PackageCheck, PackageX, ShoppingBag } from "lucide-react";
import type { ComponentType } from "react";
import { DistributorPageFrame } from "@/components/distributor-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDistributorOverview } from "@/lib/distributors.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/order-status";

export const Route = createFileRoute("/_distributor/distributor/")({
  head: () => ({ meta: [{ title: "Distributor dashboard - FEABazaar" }] }),
  component: DistributorDashboard,
});

function DistributorDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["distributor-overview"],
    queryFn: () => getDistributorOverview(),
  });

  if (error) {
    return (
      <DistributorPageFrame title="Dashboard" description="Your fulfillment operations at a glance.">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Dashboard could not load."}
        </div>
      </DistributorPageFrame>
    );
  }

  return (
    <DistributorPageFrame
      title="Dashboard"
      description="Your fulfillment operations at a glance."
    >
      {isLoading || !data ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-6">
          <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both">
            <div className="rounded-md border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <div className="font-display text-xl font-semibold">
                    {data.distributor?.name ?? "Your distributor"}
                  </div>
                  <div className="text-sm text-muted-foreground">Distributor account</div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    data.distributor?.is_active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }
                >
                  {data.distributor?.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Your coverage area
                </div>
                {data.serviceAreas.length === 0 ? (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    No pincodes are assigned to you yet — ask an admin to add coverage on the
                    Distributors page.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {data.serviceAreas.map((area) => (
                      <span
                        key={area.id}
                        className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {area.pincode}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <section className="grid animate-in fade-in slide-in-from-bottom-1 gap-4 duration-300 ease-out sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={ShoppingBag} label="Orders 30d" value={data.stats.orders30d} href="/distributor/orders" />
            <Metric
              icon={PackageCheck}
              label="Pending orders"
              value={data.stats.pendingOrders}
              href="/distributor/orders"
            />
            <Metric icon={IndianRupee} label="Revenue 30d" value={formatCents(data.stats.revenue30dCents)} />
            <Metric
              icon={AlertTriangle}
              label="Low stock"
              value={data.stats.lowStockItems}
              href="/distributor/inventory"
            />
            <Metric
              icon={PackageX}
              label="Out of stock"
              value={data.stats.outOfStockItems}
              href="/distributor/inventory"
            />
          </section>

          <section className="rounded-md border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Recent orders</h2>
              <Button asChild variant="outline" size="sm">
                <Link to="/distributor/orders">Open queue</Link>
              </Button>
            </div>
            <div className="mt-4 overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
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
                        <TableCell className="text-right font-medium">
                          {formatCents(order.total)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      )}
    </DistributorPageFrame>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="block rounded-md border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/5"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-md border border-border bg-card p-4 shadow-sm">{content}</div>;
}
