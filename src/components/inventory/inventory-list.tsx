import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { InventoryEmptyState } from "./inventory-states";
import { InventoryStatusBadge } from "./inventory-status-badge";
import type { InventoryProduct } from "./types";

export type InventoryListProps = {
  products: InventoryProduct[];
  isLoading?: boolean;
  isFiltered?: boolean;
  selectedProductId?: string;
  onAdjust: (product: InventoryProduct) => void;
  onClearFilters?: () => void;
};

export function InventoryList({
  products,
  isLoading = false,
  isFiltered = false,
  selectedProductId,
  onAdjust,
  onClearFilters,
}: InventoryListProps) {
  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      aria-labelledby="inventory-products-heading"
      aria-busy={isLoading}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="inventory-products-heading" className="font-display text-lg font-semibold">
            Products
          </h2>
          <p className="text-xs text-muted-foreground">Current catalog stock levels</p>
        </div>
        <PackageSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>

      {isLoading ? (
        <InventoryListSkeleton />
      ) : products.length === 0 ? (
        <InventoryEmptyState filtered={isFiltered} onClearFilters={onClearFilters} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption className="sr-only">
                Inventory products with current price, category, stock status, and adjustment action
              </TableCaption>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="px-4">Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock status</TableHead>
                  <TableHead className="w-24 pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => {
                  const selected = product.id === selectedProductId;
                  return (
                    <TableRow key={product.id} data-state={selected ? "selected" : undefined}>
                      <TableCell className="px-4 py-3">
                        <ProductIdentity product={product} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {product.category ?? "Uncategorized"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCents(product.priceCents)}
                      </TableCell>
                      <TableCell className="text-right">
                        <InventoryStatusBadge status={product.status} quantity={product.stockQty} />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          type="button"
                          variant={selected ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => onAdjust(product)}
                          aria-label={`Adjust stock for ${product.name}`}
                        >
                          {selected ? "Selected" : "Adjust"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {products.map((product) => {
              const selected = product.id === selectedProductId;
              return (
                <article
                  key={product.id}
                  className={cn("p-4", selected && "bg-primary/5")}
                  aria-label={product.name}
                >
                  <div className="flex items-start justify-between gap-3">
                    <ProductIdentity product={product} />
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatCents(product.priceCents)}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <InventoryStatusBadge status={product.status} quantity={product.stockQty} />
                    <Button
                      type="button"
                      variant={selected ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => onAdjust(product)}
                      aria-label={`Adjust stock for ${product.name}`}
                    >
                      {selected ? "Selected" : "Adjust stock"}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ProductIdentity({ product }: { product: InventoryProduct }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{product.name}</span>
        {!product.isActive ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inactive
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">
        {product.unitLabel} · {product.category ?? "Uncategorized"}
      </div>
    </div>
  );
}

function InventoryListSkeleton() {
  return (
    <div role="status" aria-label="Loading inventory products">
      <span className="sr-only">Loading inventory products…</span>
      <div className="hidden divide-y divide-border md:block" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.5fr_1fr_0.7fr_1fr_6rem] items-center gap-4 px-4 py-4"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
            <Skeleton className="ml-auto h-7 w-28 rounded-full" />
            <Skeleton className="ml-auto h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-border md:hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-4 p-4">
            <div className="flex justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="flex justify-between gap-3">
              <Skeleton className="h-7 w-28 rounded-full" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
