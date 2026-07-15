import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getAdminOrders, updateAdminOrder } from "@/lib/admin.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL, type OrderStatus } from "@/lib/order-status";

type PaymentStatus = "pending" | "confirmed" | "failed" | "refunded";
type OrderStatusFilter = OrderStatus | "all";
type PaymentStatusFilter = PaymentStatus | "all";

const ORDER_STATUS_OPTIONS: OrderStatus[] = [
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
const PAYMENT_STATUS_OPTIONS: PaymentStatus[] = ["pending", "confirmed", "failed", "refunded"];

export const Route = createFileRoute("/_authenticated/admin/orders")({
  head: () => ({ meta: [{ title: "Order queue - FEABazaar" }] }),
  component: AdminOrdersPage,
});

function AdminOrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState<OrderStatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filters = useMemo(
    () => ({
      search,
      orderStatus,
      paymentStatus,
      dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : "",
      dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : "",
    }),
    [search, orderStatus, paymentStatus, dateFrom, dateTo],
  );

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-orders", filters],
    queryFn: () => getAdminOrders({ data: filters }),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      orderId: string;
      orderStatus?: OrderStatus;
      paymentStatus?: PaymentStatus;
    }) => updateAdminOrder({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
      toast.success("Order updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Order update failed"),
  });

  return (
    <AdminPageFrame
      title="Order queue"
      description="Track fulfillment, payments, delivery details, and line items."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Orders could not load."}
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-md border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[1fr_190px_190px_150px_150px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search order, name, email, phone, city, PIN"
                />
              </div>
              <Select
                value={orderStatus}
                onValueChange={(value) => setOrderStatus(value as OrderStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All order statuses</SelectItem>
                  {ORDER_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={paymentStatus}
                onValueChange={(value) => setPaymentStatus(value as PaymentStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  {PAYMENT_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-both">
                        No orders found.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((order) => {
                    const address = Array.isArray(order.delivery_addresses)
                      ? order.delivery_addresses[0]
                      : order.delivery_addresses;
                    const isOpen = expanded[order.id] ?? false;
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
                                {ORDER_STATUS_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {STATUS_LABEL[status]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="min-w-36">
                            <Select
                              value={order.payment_status}
                              disabled={updateMutation.isPending}
                              onValueChange={(value) =>
                                updateMutation.mutate({
                                  orderId: order.id,
                                  paymentStatus: value as PaymentStatus,
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_STATUS_OPTIONS.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCents(order.total)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  to="/order/$orderNumber"
                                  params={{ orderNumber: order.order_number }}
                                >
                                  Open
                                </Link>
                              </Button>
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
                            </div>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`${order.id}-details`}>
                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                                <div className="rounded-md border border-border bg-background p-3">
                                  <div className="font-medium">Delivery</div>
                                  <div className="mt-2 text-sm text-muted-foreground">
                                    {address?.line1}
                                    {address?.line2 ? `, ${address.line2}` : ""}
                                    <br />
                                    {address?.city}, {address?.state} {address?.zip}
                                    <br />
                                    {address?.email}
                                  </div>
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
                                        <span>
                                          Discount
                                          {order.coupon_code ? ` (${order.coupon_code})` : ""}
                                        </span>
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
    </AdminPageFrame>
  );
}
