import type { Database } from "@/integrations/supabase/types";

export type OrderStatus = Database["public"]["Enums"]["order_status_enum"];

export const CUSTOMER_TIMELINE: OrderStatus[] = [
  "order_placed",
  "payment_confirmed",
  "order_confirmed",
  "picking_items",
  "packing",
  "ready_for_delivery",
  "sent_for_delivery",
  "completed",
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  order_placed: "Order Placed",
  payment_confirmed: "Payment Confirmed",
  order_confirmed: "Order Confirmed",
  picking_items: "Picking Items",
  packing: "Packing",
  ready_for_delivery: "Ready for Delivery",
  sent_for_delivery: "Sent for Delivery",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const STATUS_NOTIFICATION: Record<
  OrderStatus,
  { title: string; body: string } | null
> = {
  order_placed: {
    title: "Order received",
    body: "Thanks! We've received your FEABazaar order.",
  },
  payment_confirmed: {
    title: "Payment confirmed",
    body: "We've confirmed payment for your order.",
  },
  order_confirmed: {
    title: "Order confirmed",
    body: "Your order has been confirmed by our warehouse.",
  },
  picking_items: {
    title: "We're preparing your order",
    body: "Our team is picking your items now.",
  },
  packing: {
    title: "Packing your order",
    body: "Your items are being packed.",
  },
  ready_for_delivery: {
    title: "Ready for delivery",
    body: "Your order is packed and ready for handover.",
  },
  sent_for_delivery: {
    title: "Out for delivery",
    body: "Your FEABazaar order is out for delivery.",
  },
  completed: {
    title: "Order completed",
    body: "Your FEABazaar order has been completed.",
  },
  cancelled: {
    title: "Order cancelled",
    body: "Your order has been cancelled.",
  },
  refunded: {
    title: "Refund processed",
    body: "A refund has been processed for your order.",
  },
};
