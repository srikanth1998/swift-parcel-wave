import { format } from "date-fns";
import type { getDistributorOrders } from "@/lib/distributors.functions";
import { formatCents } from "@/lib/format";
import { STATUS_LABEL, SUBSTITUTION_LABEL } from "@/lib/order-status";

type DistributorOrder = Awaited<ReturnType<typeof getDistributorOrders>>[number];

// Rendered off-screen at all times (`hidden`) and only switched to visible
// when the browser is actually printing (`print:block`), in tandem with the
// `@media print` rule in styles.css that hides everything else on the page.
// Deliberately plain black-on-white rather than the app's theme tokens —
// this is a physical packing slip, not a themed UI surface, and must stay
// legible regardless of dark mode or ink-saving print settings.
export function OrderPrintSheet({
  order,
  distributorName,
  productNameById,
}: {
  order: DistributorOrder;
  distributorName: string | null | undefined;
  productNameById: Map<string, string>;
}) {
  const address = Array.isArray(order.delivery_addresses)
    ? order.delivery_addresses[0]
    : order.delivery_addresses;

  return (
    <div id="order-print-sheet" className="hidden print:block">
      <div className="mx-auto max-w-3xl bg-white p-8 text-black">
        <div className="flex items-start justify-between border-b border-black/20 pb-4">
          <div>
            <div className="text-xl font-bold">FEABazaar</div>
            <div className="text-sm">Order packing slip</div>
            {distributorName && (
              <div className="text-sm text-black/70">Fulfilled by: {distributorName}</div>
            )}
          </div>
          <div className="text-right text-sm">
            <div className="text-lg font-bold">{order.order_number}</div>
            <div>{format(new Date(order.created_at), "MMM d, yyyy h:mm a")}</div>
            <div>{STATUS_LABEL[order.order_status]}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-semibold">Deliver to</div>
            <div className="mt-1">{address?.full_name ?? "Guest"}</div>
            <div>{address?.phone}</div>
            <div>
              {address?.line1}
              {address?.line2 ? `, ${address.line2}` : ""}
            </div>
            <div>
              {address?.city}, {address?.state} {address?.zip}
            </div>
            {address?.instructions && (
              <div className="mt-1 text-black/70">Address note: {address.instructions}</div>
            )}
          </div>
          <div>
            <div className="font-semibold">Order details</div>
            <div className="mt-1">Payment: Cash on Delivery · {order.payment_status}</div>
            <div>Substitution: {SUBSTITUTION_LABEL[order.substitution_preference]}</div>
            {order.delivery_instructions && (
              <div className="mt-1 text-black/70">
                Delivery notes: {order.delivery_instructions}
              </div>
            )}
            {order.customer_notes && (
              <div className="mt-1 text-black/70">Customer notes: {order.customer_notes}</div>
            )}
          </div>
        </div>

        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-2 pr-2 font-semibold">Qty</th>
              <th className="py-2 pr-2 font-semibold">Item</th>
              <th className="py-2 pr-2 text-right font-semibold">Unit price</th>
              <th className="py-2 text-right font-semibold">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-black/10">
                <td className="py-2 pr-2 align-top">{item.ordered_qty}</td>
                <td className="py-2 pr-2 align-top">
                  {item.name_snapshot}
                  {item.is_unavailable && (
                    <div className="text-xs text-black/70">
                      Unavailable
                      {item.replacement_product_id &&
                        ` — replaced with ${
                          productNameById.get(item.replacement_product_id) ?? "a substitute product"
                        }`}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2 text-right align-top">
                  {formatCents(item.unit_price_cents)}
                </td>
                <td className="py-2 text-right align-top">
                  {formatCents(item.unit_price_cents * item.ordered_qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-4 w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCents(order.subtotal)}</span>
          </div>
          {order.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>−{formatCents(order.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{formatCents(order.tax)}</span>
          </div>
          <div className="flex justify-between">
            <span>Delivery</span>
            <span>{order.delivery_charge === 0 ? "Free" : formatCents(order.delivery_charge)}</span>
          </div>
          <div className="flex justify-between border-t border-black/40 pt-1 font-semibold">
            <span>Total</span>
            <span>{formatCents(order.total)}</span>
          </div>
        </div>

        <div className="mt-8 text-xs text-black/60">
          Printed {format(new Date(), "MMM d, yyyy h:mm a")}
        </div>
      </div>
    </div>
  );
}
