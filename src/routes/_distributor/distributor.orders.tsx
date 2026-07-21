import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Ban, ChevronDown, ChevronRight, Loader2, Printer } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { DistributorPageFrame } from "@/components/distributor-nav";
import { OrderPrintSheet } from "@/components/order-print-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import {
  getDistributorOrders,
  getDistributorOverview,
  markOrderItemUnavailable,
  updateDistributorOrder,
} from "@/lib/distributors.functions";
import { formatCents } from "@/lib/format";
import {
  STATUS_LABEL,
  SUBSTITUTION_LABEL,
  type OrderStatus,
  type SubstitutionPreference,
} from "@/lib/order-status";
import { listProducts } from "@/lib/products.functions";

type OrderStatusFilter = OrderStatus | "all";
type DistributorOrder = Awaited<ReturnType<typeof getDistributorOrders>>[number];

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
  // "Mark unavailable" flows: a Dialog (product picker) for replace_similar,
  // an AlertDialog (plain confirm) for refund_if_unavailable / contact_me.
  const [replaceDialogItem, setReplaceDialogItem] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [replacementProductId, setReplacementProductId] = useState<string>("");
  const [confirmItem, setConfirmItem] = useState<{
    id: string;
    name: string;
    preference: Extract<SubstitutionPreference, "refund_if_unavailable" | "contact_me">;
  } | null>(null);
  const [printOrder, setPrintOrder] = useState<DistributorOrder | null>(null);

  const {
    data: orders = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["distributor-orders", orderStatus],
    queryFn: () => getDistributorOrders({ data: { orderStatus } }),
  });

  // Small (~32 item) active catalog, reused both for the replacement picker
  // and to resolve a replacement product's name for display.
  const { data: products = [] } = useQuery({
    queryKey: ["products", { forSubstitution: true }],
    queryFn: () => listProducts({ data: {} }),
  });
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  // Same query key as DistributorNav's call, so this just reads the already
  // -cached distributor name instead of firing a second network request.
  const { data: overview } = useQuery({
    queryKey: ["distributor-overview"],
    queryFn: () => getDistributorOverview(),
  });

  // Printing renders OrderPrintSheet into the DOM (see below) then hands off
  // to the browser; afterprint fires whether the user printed or cancelled,
  // so either way the sheet unmounts again afterwards.
  useEffect(() => {
    if (!printOrder) return;
    window.print();
  }, [printOrder]);

  useEffect(() => {
    const handleAfterPrint = () => setPrintOrder(null);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

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

  const markUnavailableMutation = useMutation({
    mutationFn: ({
      orderItemId,
      replacementProductId: replacementId,
    }: {
      orderItemId: string;
      replacementProductId?: string;
      successMessage: string;
    }) => markOrderItemUnavailable({ data: { orderItemId, replacementProductId: replacementId } }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["distributor-orders"] });
      setReplaceDialogItem(null);
      setReplacementProductId("");
      setConfirmItem(null);
      toast.success(variables.successMessage);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update item"),
  });

  function startMarkUnavailable(
    item: { id: string; name_snapshot: string },
    preference: SubstitutionPreference,
  ) {
    if (preference === "replace_similar") {
      setReplacementProductId("");
      setReplaceDialogItem({ id: item.id, name: item.name_snapshot });
      return;
    }
    setConfirmItem({ id: item.id, name: item.name_snapshot, preference });
  }

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
                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Print order"
                                onClick={() => setPrintOrder(order)}
                              >
                                <Printer />
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
                            <TableCell colSpan={5} className="bg-muted/30 p-4">
                              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-medium text-foreground">
                                  Substitution preference:
                                </span>
                                <Badge variant="outline">
                                  {SUBSTITUTION_LABEL[order.substitution_preference]}
                                </Badge>
                              </div>
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
                                        className="flex items-start justify-between gap-3 py-2 text-sm"
                                      >
                                        <span>
                                          {item.ordered_qty} x {item.name_snapshot}
                                          {item.is_unavailable && (
                                            <Badge variant="outline" className="ml-2 border-red-200 bg-red-50 text-red-700">
                                              Unavailable
                                            </Badge>
                                          )}
                                          {item.is_unavailable && item.replacement_product_id && (
                                            <div className="mt-1 text-xs text-muted-foreground">
                                              Replaced with{" "}
                                              {productNameById.get(item.replacement_product_id) ??
                                                "a substitute product"}
                                            </div>
                                          )}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-2">
                                          <span className="font-medium">
                                            {formatCents(item.unit_price_cents * item.ordered_qty)}
                                          </span>
                                          {!item.is_unavailable && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              title="Mark unavailable"
                                              onClick={() =>
                                                startMarkUnavailable(item, order.substitution_preference)
                                              }
                                            >
                                              <Ban className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
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

      <Dialog
        open={replaceDialogItem !== null}
        onOpenChange={(open) => !open && setReplaceDialogItem(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose a substitute</DialogTitle>
            <DialogDescription>
              {replaceDialogItem
                ? `"${replaceDialogItem.name}" is unavailable. Pick a replacement product to send instead.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="replacement-product">Replacement product</Label>
            <Select value={replacementProductId} onValueChange={setReplacementProductId}>
              <SelectTrigger id="replacement-product">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={!replacementProductId || markUnavailableMutation.isPending}
              onClick={() => {
                if (!replaceDialogItem) return;
                markUnavailableMutation.mutate({
                  orderItemId: replaceDialogItem.id,
                  replacementProductId,
                  successMessage: "Item marked unavailable and substitution recorded",
                });
              }}
            >
              {markUnavailableMutation.isPending && <Loader2 className="animate-spin" />}
              Confirm substitution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmItem !== null}
        onOpenChange={(open) => !open && setConfirmItem(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark item unavailable?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmItem &&
                (confirmItem.preference === "refund_if_unavailable"
                  ? `"${confirmItem.name}" will be marked unavailable. This will reduce the amount due on this order.`
                  : `"${confirmItem.name}" will be marked unavailable. The customer will be notified and needs a follow-up.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={markUnavailableMutation.isPending}
              onClick={() => {
                if (!confirmItem) return;
                markUnavailableMutation.mutate({
                  orderItemId: confirmItem.id,
                  successMessage:
                    confirmItem.preference === "refund_if_unavailable"
                      ? "Item marked unavailable — amount due updated"
                      : "Item marked unavailable — customer notified",
                });
              }}
            >
              Mark unavailable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {printOrder && (
        <OrderPrintSheet
          order={printOrder}
          distributorName={overview?.distributor?.name}
          productNameById={productNameById}
        />
      )}
    </DistributorPageFrame>
  );
}
