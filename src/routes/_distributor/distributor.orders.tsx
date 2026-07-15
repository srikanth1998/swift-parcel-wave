import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { DistributorPageFrame } from "@/components/distributor-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getDistributorOrders, updateDistributorOrder } from "@/lib/distributors.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

type OrderStatusFilter = OrderStatus | "all";

// Distributors may only move orders through the fulfillment lifecycle —
// this must mirror DISTRIBUTOR_ALLOWED_STATUSES in distributors.functions.ts
// exactly, since the picker (not just the backend) gates what's offered.
const DISTRIBUTOR_EDITABLE_STATUSES: OrderStatus[] = [
  "order_confirmed",
  "picking_items",
  "packing",
  "ready_for_delivery",
  "sent_for_delivery",
];

const FILTER_STATUS_OPTIONS: OrderStatus[] = [
  "order_placed",
  "payment_confirmed",
  "order_confirmed",
  "picking_items",
  "packing",
  "ready_for_delivery",
  "sent_for_delivery",
  "completed",
  "cancelled",
  "refunded",
];

export const Route = createFileRoute("/_distributor/distributor/orders")({
  head: () => ({ meta: [{ title: "Orders - FEABazaar distributor" }] }),
  component: DistributorOrdersPage,
});

function DistributorOrdersPage() {
  const queryClient = useQueryClient();
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["distributor-orders", orderStatus],
    queryFn: () => getDistributorOrders({ data: { orderStatus } }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { orderId: string; orderStatus: OrderStatus }) =>
      updateDistributorOrder({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distributor-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["distributor-overview"] });
      toast.success("Order updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Order update failed"),
  });

  return (
    <DistributorPageFrame
      title="Orders"
      description="Move orders through picking, packing, and delivery."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Orders could not load."}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 space-y-4 duration-300 ease-out fill-mode-both">
          <section className="rounded-md border border-border bg-card p-4 shadow-sm">
            <div className="max-w-xs">
              <Select
                value={orderStatus}
                onValueChange={(value) => setOrderStatus(value as OrderStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All order statuses</SelectItem>
                  {FILTER_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No orders found.
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => {
                    const address = Array.isArray(order.delivery_addresses)
                      ? order.delivery_addresses[0]
                      : order.delivery_addresses;
                    const isOpen = expanded[order.id] ?? false;
                    const isEditable = DISTRIBUTOR_EDITABLE_STATUSES.includes(order.order_status);
                    return (
                      <Fragment key={order.id}>
                        <TableRow>
                          <TableCell>
                            <div className="font-medium">{order.order_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(order.created_at), "MMM d, yyyy h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{address?.full_name ?? "Guest"}</div>
                            <div className="text-xs text-muted-foreground">{address?.phone}</div>
                          </TableCell>
                          <TableCell className="min-w-48">
                            {isEditable ? (
                              <Select
                                value={order.order_status}
                                disabled={updateMutation.isPending}
                                onValueChange={(value) =>
                                  updateMutation.mutate({
                                    orderId: order.id,
                                    orderStatus: value as OrderStatus,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {DISTRIBUTOR_EDITABLE_STATUSES.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {STATUS_LABEL[status]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span
                                key={order.order_status}
                                className="animate-badge-bump inline-flex rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
                              >
                                {STATUS_LABEL[order.order_status]}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCents(order.total)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Toggle details"
                              onClick={() =>
                                setExpanded((current) => ({ ...current, [order.id]: !isOpen }))
                              }
                            >
                              {isOpen ? <ChevronDown /> : <ChevronRight />}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${order.id}-details`}>
                            <TableCell colSpan={5} className="bg-muted/30 p-4">
                              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                                <div className="rounded-md border border-border bg-background p-3">
                                  <div className="font-medium">Delivery</div>
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    {address?.line1}
                                    {address?.line2 ? `, ${address.line2}` : ""}
                                    <br />
                                    {address?.city}, {address?.state} {address?.zip}
                                    <br />
                                    {address?.phone}
                                  </div>
                                  {order.delivery_instructions && (
                                    <div className="mt-3 text-sm">
                                      <span className="font-medium">Delivery notes:</span>{" "}
                                      {order.delivery_instructions}
                                    </div>
                                  )}
                                  {order.customer_notes && (
                                    <div className="mt-3 text-sm">
                                      <span className="font-medium">Notes:</span>{" "}
                                      {order.customer_notes}
                                    </div>
                                  )}
                                </div>
                                <div className="rounded-md border border-border bg-background p-3">
                                  <div className="font-medium">Items</div>
                                  <div className="mt-2 divide-y divide-border">
                                    {order.items.map((item) => (
                                      <div
                                        key={item.id}
                                        className="flex justify-between gap-3 py-2 text-sm"
                                      >
                                        <span>
                                          {item.ordered_qty} x {item.name_snapshot}
                                          {item.is_unavailable && (
                                            <Badge variant="outline" className="ml-2 border-red-200 bg-red-50 text-red-700">
                                              Unavailable
                                            </Badge>
                                          )}
                                        </span>
                                        <span className="font-medium">
                                          {formatCents(item.unit_price_cents * item.ordered_qty)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Subtotal</span>
                                      <span>{formatCents(order.subtotal)}</span>
                                    </div>
                                    {order.discount > 0 && (
                                      <div className="flex justify-between text-emerald-700">
                                        <span>Discount</span>
                                        <span>−{formatCents(order.discount)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Tax</span>
                                      <span>{formatCents(order.tax)}</span>
                                    </div>
                                    <div className="flex justify-between text-muted-foreground">
                                      <span>Delivery</span>
                                      <span>
                                        {order.delivery_charge === 0
                                          ? "Free"
                                          : formatCents(order.delivery_charge)}
                                      </span>
                                    </div>
                                    <div className="flex justify-between pt-1 font-semibold">
                                      <span>Total</span>
                                      <span>{formatCents(order.total)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </DistributorPageFrame>
  );
}
