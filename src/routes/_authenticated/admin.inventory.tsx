import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { InventoryActivity } from "@/components/inventory/inventory-activity";
import { InventoryList } from "@/components/inventory/inventory-list";
import { InventoryMetrics } from "@/components/inventory/inventory-metrics";
import { InventoryErrorState } from "@/components/inventory/inventory-states";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import { StockAdjustmentForm } from "@/components/inventory/stock-adjustment-form";
import type {
  AdjustmentFormValue,
  AdjustmentSubmission,
  InventoryFilters,
  InventoryProduct,
} from "@/components/inventory/types";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { adjustInventory, getAdminInventory } from "@/lib/inventory.functions";

const INITIAL_FILTERS: InventoryFilters = {
  query: "",
  status: "all",
  category: null,
  sort: "stock-asc",
};

const INITIAL_ADJUSTMENT: AdjustmentFormValue = {
  productId: "",
  mode: "delta",
  amount: "",
  reason: "restock",
  note: "",
};

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory - FEABazaar" },
      {
        name: "description",
        content: "Monitor product stock and record auditable inventory adjustments.",
      },
    ],
  }),
  component: AdminInventoryPage,
});

function AdminInventoryPage() {
  const queryClient = useQueryClient();
  const prefersReducedMotion = usePrefersReducedMotion();
  const adjustmentFormRef = useRef<HTMLElement>(null);
  const [filters, setFilters] = useState<InventoryFilters>(INITIAL_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [adjustment, setAdjustment] = useState<AdjustmentFormValue>(INITIAL_ADJUSTMENT);

  const inventoryQuery = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => getAdminInventory(),
  });

  const adjustmentMutation = useMutation({
    mutationFn: (submission: AdjustmentSubmission) =>
      adjustInventory({
        data: {
          productId: submission.productId,
          mode: submission.mode,
          amount: submission.amount,
          reason: submission.reason,
          note: submission.note.trim() || null,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      setAdjustment((current) => ({ ...current, amount: "", note: "" }));
      toast.success("Stock updated", {
        description: "The adjustment was saved to the inventory log.",
      });
    },
    onError: (error) => {
      toast.error("Adjustment failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  const products = useMemo(
    () => inventoryQuery.data?.products ?? [],
    [inventoryQuery.data?.products],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          products
            .map((product) => product.category)
            .filter((value): value is string => Boolean(value)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [products],
  );

  const visibleProducts = useMemo(() => {
    const query = deferredQuery.trim().toLocaleLowerCase();
    const next = products.filter((product) => {
      const matchesQuery =
        !query ||
        [product.name, product.slug, product.category, product.unitLabel]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase().includes(query));
      const matchesStatus = filters.status === "all" || product.status === filters.status;
      const matchesCategory = filters.category === null || product.category === filters.category;
      return matchesQuery && matchesStatus && matchesCategory;
    });

    return [...next].sort((left, right) => {
      switch (filters.sort) {
        case "stock-desc":
          return right.stockQty - left.stockQty || left.name.localeCompare(right.name);
        case "name-asc":
          return left.name.localeCompare(right.name);
        case "name-desc":
          return right.name.localeCompare(left.name);
        case "stock-asc":
          return left.stockQty - right.stockQty || left.name.localeCompare(right.name);
      }
    });
  }, [deferredQuery, filters.category, filters.sort, filters.status, products]);

  const isFiltered =
    filters.query.trim().length > 0 || filters.status !== "all" || filters.category !== null;

  function handleAdjustmentChange(value: AdjustmentFormValue) {
    if (adjustmentMutation.error) adjustmentMutation.reset();
    setAdjustment(value);
  }

  function handleAdjustProduct(product: InventoryProduct) {
    adjustmentMutation.reset();
    setAdjustment({
      productId: product.id,
      mode: "delta",
      amount: "",
      reason: "restock",
      note: "",
    });

    window.requestAnimationFrame(() => {
      adjustmentFormRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      adjustmentFormRef.current?.focus({ preventScroll: true });
    });
  }

  return (
    <AdminPageFrame
      title="Inventory"
      description="Monitor stock health, find products quickly, and keep every adjustment auditable."
    >
      {inventoryQuery.error && !inventoryQuery.data ? (
        <InventoryErrorState
          error={inventoryQuery.error}
          onRetry={() => void inventoryQuery.refetch()}
          isRetrying={inventoryQuery.isFetching}
        />
      ) : (
        <div className="space-y-5">
          {inventoryQuery.error ? (
            <InventoryErrorState
              error={inventoryQuery.error}
              onRetry={() => void inventoryQuery.refetch()}
              isRetrying={inventoryQuery.isFetching}
            />
          ) : null}

          <InventoryMetrics
            stats={inventoryQuery.data?.stats}
            isLoading={inventoryQuery.isLoading}
          />

          <InventoryToolbar
            value={filters}
            onChange={setFilters}
            onClear={() => setFilters(INITIAL_FILTERS)}
            categories={categories}
            resultCount={inventoryQuery.isLoading ? 0 : visibleProducts.length}
            totalCount={inventoryQuery.isLoading ? 0 : products.length}
            disabled={inventoryQuery.isLoading}
          />

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <InventoryList
              products={visibleProducts}
              isLoading={inventoryQuery.isLoading}
              isFiltered={isFiltered}
              selectedProductId={adjustment.productId}
              onAdjust={handleAdjustProduct}
              onClearFilters={() => setFilters(INITIAL_FILTERS)}
            />

            <aside className="space-y-5 xl:sticky xl:top-28">
              <StockAdjustmentForm
                ref={adjustmentFormRef}
                products={products}
                value={adjustment}
                onChange={handleAdjustmentChange}
                onSubmit={(submission) => adjustmentMutation.mutate(submission)}
                isSubmitting={adjustmentMutation.isPending}
                disabled={inventoryQuery.isLoading}
                submissionError={
                  adjustmentMutation.error instanceof Error
                    ? adjustmentMutation.error.message
                    : null
                }
              />
              <InventoryActivity
                adjustments={inventoryQuery.data?.recentAdjustments ?? []}
                isLoading={inventoryQuery.isLoading}
              />
            </aside>
          </div>
        </div>
      )}
    </AdminPageFrame>
  );
}
