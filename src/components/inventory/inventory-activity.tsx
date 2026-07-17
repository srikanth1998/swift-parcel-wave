import { format, isValid } from "date-fns";
import { ArrowDown, ArrowUp, Clock3, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { InventoryAdjustment } from "./types";

export type InventoryActivityProps = {
  adjustments: InventoryAdjustment[];
  isLoading?: boolean;
};

export function InventoryActivity({ adjustments, isLoading = false }: InventoryActivityProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby="inventory-activity-heading"
      aria-busy={isLoading}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="inventory-activity-heading" className="font-display text-lg font-semibold">
            Recent activity
          </h2>
          <p className="text-xs text-muted-foreground">Latest stock adjustments</p>
        </div>
        <Clock3 className="mt-1 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>

      {isLoading ? (
        <ActivitySkeleton />
      ) : adjustments.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-medium">No adjustments yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Completed stock changes will appear here.
          </p>
        </div>
      ) : (
        <ol
          className="max-h-[32rem] divide-y divide-border overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label="Recent inventory adjustments"
          tabIndex={0}
        >
          {adjustments.map((adjustment) => {
            const positive = adjustment.delta > 0;
            const negative = adjustment.delta < 0;
            const changeLabel = positive
              ? `Added ${adjustment.delta} units`
              : negative
                ? `Removed ${Math.abs(adjustment.delta)} units`
                : "No stock change";
            const date = new Date(adjustment.created_at);
            return (
              <li key={adjustment.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{adjustment.productName}</p>
                    <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                      {adjustment.reason.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-mono text-xs font-semibold tabular-nums",
                      positive
                        ? "bg-emerald-50 text-emerald-700"
                        : negative
                          ? "bg-red-50 text-red-700"
                          : "bg-muted text-muted-foreground",
                    )}
                    aria-label={changeLabel}
                  >
                    {positive ? (
                      <ArrowUp className="h-3 w-3" aria-hidden="true" />
                    ) : negative ? (
                      <ArrowDown className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Minus className="h-3 w-3" aria-hidden="true" />
                    )}
                    {positive ? "+" : ""}
                    {adjustment.delta.toLocaleString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">
                    {adjustment.previous_qty.toLocaleString()} →{" "}
                    {adjustment.new_qty.toLocaleString()}
                  </span>
                  <time dateTime={adjustment.created_at}>
                    {isValid(date) ? format(date, "MMM d, yyyy · h:mm a") : "Date unavailable"}
                  </time>
                </div>
                {adjustment.note ? (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    “{adjustment.note}”
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function ActivitySkeleton() {
  return (
    <div className="divide-y divide-border" role="status" aria-label="Loading recent activity">
      <span className="sr-only">Loading recent inventory activity…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3 p-4" aria-hidden="true">
          <div className="flex justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>
          <div className="flex justify-between gap-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
