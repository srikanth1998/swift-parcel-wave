import { AlertTriangle, Boxes, Layers3, PackageX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InventoryStats } from "./types";

export type InventoryMetricsProps = {
  stats?: InventoryStats;
  isLoading?: boolean;
};

const METRICS: Array<{
  key: keyof InventoryStats;
  label: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    key: "totalProducts",
    label: "Products",
    helper: "Tracked SKUs",
    icon: Layers3,
    tone: "bg-primary/10 text-primary",
  },
  {
    key: "lowStock",
    label: "Low stock",
    helper: "10 units or fewer",
    icon: AlertTriangle,
    tone: "bg-amber-100 text-amber-700",
  },
  {
    key: "outOfStock",
    label: "Out of stock",
    helper: "Needs attention",
    icon: PackageX,
    tone: "bg-red-100 text-red-700",
  },
  {
    key: "totalUnits",
    label: "Units on hand",
    helper: "Across all products",
    icon: Boxes,
    tone: "bg-sky-100 text-sky-700",
  },
];

export const InventoryMetrics = memo(function InventoryMetrics({
  stats,
  isLoading = false,
}: InventoryMetricsProps) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory summary">
      {METRICS.map(({ key, label, helper, icon: Icon, tone }) => (
        <div key={key} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-2 font-display text-3xl font-semibold tracking-tight">
                {isLoading ? (
                  <Skeleton className="h-9 w-16" aria-hidden="true" />
                ) : (
                  (stats?.[key] ?? 0).toLocaleString()
                )}
              </dd>
            </div>
            <span className={cn("rounded-lg p-2", tone)} aria-hidden="true">
              <Icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
        </div>
      ))}
    </dl>
  );
});
