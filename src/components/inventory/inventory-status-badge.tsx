import { memo } from "react";
import { cn } from "@/lib/utils";
import type { InventoryStatus } from "./types";

const STATUS_CONFIG: Record<
  InventoryStatus,
  { label: string; className: string; dotClassName: string }
> = {
  ok: {
    label: "In stock",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-500",
  },
  low: {
    label: "Low stock",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-500",
  },
  out: {
    label: "Out of stock",
    className: "border-red-200 bg-red-50 text-red-800",
    dotClassName: "bg-red-500",
  },
};

export type InventoryStatusBadgeProps = {
  status: InventoryStatus;
  quantity?: number;
  animate?: boolean;
  className?: string;
};

export const InventoryStatusBadge = memo(function InventoryStatusBadge({
  status,
  quantity,
  animate = false,
  className,
}: InventoryStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums",
        animate && "animate-badge-bump",
        config.className,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClassName)} aria-hidden="true" />
      {typeof quantity === "number"
        ? `${quantity.toLocaleString()} · ${config.label}`
        : config.label}
    </span>
  );
});
