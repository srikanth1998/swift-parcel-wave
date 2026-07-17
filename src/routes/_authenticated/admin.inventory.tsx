import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { InventoryActivity } from "@/components/inventory/inventory-activity";
import { InventoryList } from "@/components/inventory/inventory-list";
import { InventoryMetrics } from "@/components/inventory/inventory-metrics";
import { InventoryPagination } from "@/components/inventory/inventory-pagination";
import { InventoryErrorState } from "@/components/inventory/inventory-states";
import { InventoryToolbar } from "@/components/inventory/inventory-toolbar";
import { StockAdjustmentForm } from "@/components/inventory/stock-adjustment-form";
import type {
  AdminInventoryData,
  AdjustmentFormValue,
  AdjustmentSubmission,
  InventoryAdjustment,
  InventoryFilters,
  InventoryProduct,
  InventoryStatus,
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

const INVENTORY_QUERY_KEY = ["admin-inventory"] as const;
const INVENTORY_PAGE_SIZE = 50;
const INVENTORY_STALE_TIME = 30_000;
const INVENTORY_CACHE_TIME = 10 * 60_000;
const EMPTY_ADJUSTMENTS: InventoryAdjustment[] = [];

function getInventoryStatus(stockQty: number): InventoryStatus {
  if (stockQty <= 0) return "out";
  if (stockQty <= 10) return "low";
  return "ok";
}

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
  const scrollFrameRef = useRef<number | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(INITIAL_FILTERS);
  const deferredQuery = useDeferredValue(filters.query);
  const [adjustment, setAdjustment] = useState<AdjustmentFormValue>(INITIAL_ADJUSTMENT);
  const [page, setPage] = useState(1);

  const inventoryQuery = useQuery({
    queryKey: INVENTORY_QUERY_KEY,
    queryFn: () => getAdminInventory(),
    staleTime: INVENTORY_STALE_TIME,
    gcTime: INVENTORY_CACHE_TIME,
    retry: 1,
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
    onSuccess: (result, submission) => {
      queryClient.setQueryData<AdminInventoryData>(INVENTORY_QUERY_KEY, (current) => {
        if (!current) return current;
        const currentProduct = current.products.find(
          (product) => product.id === submission.productId,
        );
        if (!currentProduct) return current;

        const nextStatus = getInventoryStatus(result.newQty);
        const cachedDelta = result.newQty - currentProduct.stockQty;
        return {
          ...current,
          products: current.products.map((product) =>
            product.id === submission.productId
              ? { ...product, stockQty: result.newQty, status: nextStatus }
              : product,
          ),
          stats: {
            ...current.stats,
            totalUnits: current.stats.totalUnits + cachedDelta,
            lowStock:
              current.stats.lowStock +
              Number(nextStatus === "low") -
              Number(currentProduct.status === "low"),
            outOfStock:
              current.stats.outOfStock +
              Number(nextStatus === "out") -
              Number(currentProduct.status === "out"),
          },
        };
      });
      setAdjustment((current) => ({ ...current, amount: "", note: "" }));
      toast.success("Stock updated", {
        description: "The adjustment was saved to the inventory log.",
      });
      void queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
    },
    onError: (error) => {
      toast.error("Adjustment failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

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

  const indexedProducts = useMemo(
    () =>
      products.map((product) => ({
        product,
        searchText:
          `${product.name}\u0000${product.slug}\u0000${product.category ?? ""}\u0000${product.unitLabel}`.toLocaleLowerCase(),
      })),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = deferredQuery.trim().toLocaleLowerCase();
    const next: InventoryProduct[] = [];
    for (const { product, searchText } of indexedProducts) {
      const matchesQuery = !query || searchText.includes(query);
      const matchesStatus = filters.status === "all" || product.status === filters.status;
      const matchesCategory = filters.category === null || product.category === filters.category;
      if (matchesQuery && matchesStatus && matchesCategory) next.push(product);
    }

    return next.sort((left, right) => {
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
  }, [deferredQuery, filters.category, filters.sort, filters.status, indexedProducts]);

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / INVENTORY_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleProducts = useMemo(() => {
    const start = (currentPage - 1) * INVENTORY_PAGE_SIZE;
    return filteredProducts.slice(start, start + INVENTORY_PAGE_SIZE);
  }, [currentPage, filteredProducts]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === adjustment.productId),
    [adjustment.productId, products],
  );

  const isFiltered =
    filters.query.trim().length > 0 || filters.status !== "all" || filters.category !== null;

  const mutationError = adjustmentMutation.error;
  const resetMutation = adjustmentMutation.reset;
  const mutateAdjustment = adjustmentMutation.mutate;
  const refetchInventory = inventoryQuery.refetch;

  const handleFiltersChange = useCallback((value: InventoryFilters) => {
    setFilters(value);
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }, []);

  const handleAdjustmentChange = useCallback(
    (value: AdjustmentFormValue) => {
      if (mutationError) resetMutation();
      setAdjustment(value);
    },
    [mutationError, resetMutation],
  );

  const handleSubmit = useCallback(
    (submission: AdjustmentSubmission) => mutateAdjustment(submission),
    [mutateAdjustment],
  );

  const handleAdjustProduct = useCallback(
    (product: InventoryProduct) => {
      resetMutation();
      setAdjustment({
        productId: product.id,
        mode: "delta",
        amount: "",
        reason: "restock",
        note: "",
      });

      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        adjustmentFormRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
        adjustmentFormRef.current?.focus({ preventScroll: true });
        scrollFrameRef.current = null;
      });
    },
    [prefersReducedMotion, resetMutation],
  );

  const handleRetry = useCallback(() => void refetchInventory(), [refetchInventory]);

  return (
    <AdminPageFrame
      title="Inventory"
      description="Monitor stock health, find products quickly, and keep every adjustment auditable."
    >
      {inventoryQuery.error && !inventoryQuery.data ? (
        <InventoryErrorState
          error={inventoryQuery.error}
          onRetry={handleRetry}
          isRetrying={inventoryQuery.isFetching}
        />
      ) : (
        <div className="space-y-5">
          {inventoryQuery.error ? (
            <InventoryErrorState
              error={inventoryQuery.error}
              onRetry={handleRetry}
              isRetrying={inventoryQuery.isFetching}
            />
          ) : null}

          <InventoryMetrics
            stats={inventoryQuery.data?.stats}
            isLoading={inventoryQuery.isLoading}
          />

          <InventoryToolbar
            value={filters}
            onChange={handleFiltersChange}
            onClear={handleClearFilters}
            categories={categories}
            resultCount={inventoryQuery.isLoading ? 0 : filteredProducts.length}
            totalCount={inventoryQuery.isLoading ? 0 : products.length}
            disabled={inventoryQuery.isLoading}
          />

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="space-y-3">
              <InventoryList
                products={visibleProducts}
                isLoading={inventoryQuery.isLoading}
                isFiltered={isFiltered}
                selectedProductId={adjustment.productId}
                onAdjust={handleAdjustProduct}
                onClearFilters={handleClearFilters}
              />
              <InventoryPagination
                page={currentPage}
                pageSize={INVENTORY_PAGE_SIZE}
                totalCount={filteredProducts.length}
                onPageChange={setPage}
              />
            </div>

            <aside className="space-y-5 xl:sticky xl:top-28">
              <StockAdjustmentForm
                ref={adjustmentFormRef}
                selectedProduct={selectedProduct}
                value={adjustment}
                onChange={handleAdjustmentChange}
                onSubmit={handleSubmit}
                isSubmitting={adjustmentMutation.isPending}
                disabled={inventoryQuery.isLoading}
                submissionError={
                  adjustmentMutation.error instanceof Error
                    ? adjustmentMutation.error.message
                    : null
                }
              />
              <InventoryActivity
                adjustments={inventoryQuery.data?.recentAdjustments ?? EMPTY_ADJUSTMENTS}
                isLoading={inventoryQuery.isLoading}
              />
            </aside>
          </div>
        </div>
      )}
    </AdminPageFrame>
  );
}
