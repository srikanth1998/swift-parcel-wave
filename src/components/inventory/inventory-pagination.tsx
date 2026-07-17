import { ChevronLeft, ChevronRight } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";

export type InventoryPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export const InventoryPagination = memo(function InventoryPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: InventoryPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
      aria-label="Inventory pagination"
    >
      <p className="text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{start.toLocaleString()}</span>–
        <span className="font-medium text-foreground">{end.toLocaleString()}</span> of{" "}
        <span className="font-medium text-foreground">{totalCount.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous inventory page"
        >
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
        <span className="min-w-20 text-center text-xs tabular-nums text-muted-foreground">
          {page} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next inventory page"
        >
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
});
