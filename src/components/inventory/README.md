# Inventory UI system

The inventory route is the orchestration layer: it owns React Query, mutations, filters, and selected-product state. Components in this directory are controlled, domain-typed, and do not fetch data, which makes them reusable in admin, distributor, and catalog-management surfaces.

## Architecture

| Component              | Responsibility                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `InventoryMetrics`     | Summary KPIs with loading skeletons and semantic `dl` markup                           |
| `InventoryToolbar`     | Controlled search, status/category filters, sorting, reset, and result announcements   |
| `InventoryList`        | Runtime-selected desktop table or mobile cards, loading skeletons, and empty states    |
| `InventoryPagination`  | Accessible bounded-DOM pagination for large result sets                                |
| `InventoryStatusBadge` | Consistent, text-backed stock status presentation                                      |
| `StockAdjustmentForm`  | Controlled adjustment workflow, validation, quantity preview, and pending/error states |
| `InventoryActivity`    | Keyboard-accessible audit history with positive/negative change semantics              |
| `InventoryErrorState`  | Recoverable query error with retry action                                              |
| `types.ts`             | Shared product, adjustment, filter, form, and submission contracts                     |

## Component APIs

```ts
type InventoryToolbarProps = {
  value: InventoryFilters;
  onChange: (value: InventoryFilters) => void;
  onClear: () => void;
  categories: string[];
  resultCount: number;
  totalCount: number;
  disabled?: boolean;
};

type InventoryListProps = {
  products: InventoryProduct[];
  isLoading?: boolean;
  isFiltered?: boolean;
  selectedProductId?: string;
  onAdjust: (product: InventoryProduct) => void;
  onClearFilters?: () => void;
};

type StockAdjustmentFormProps = {
  selectedProduct?: InventoryProduct;
  value: AdjustmentFormValue;
  onChange: (value: AdjustmentFormValue) => void;
  onSubmit: (value: AdjustmentSubmission) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  submissionError?: string | null;
};

type InventoryPaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};
```

The remaining components accept their domain value plus an optional loading or presentation flag. See the exported prop type beside each component implementation.

## Usage

```tsx
const [filters, setFilters] = useState<InventoryFilters>(initialFilters);
const [adjustment, setAdjustment] = useState<AdjustmentFormValue>(initialAdjustment);

<InventoryToolbar
  value={filters}
  onChange={setFilters}
  onClear={() => setFilters(initialFilters)}
  categories={categories}
  resultCount={visibleProducts.length}
  totalCount={products.length}
/>

<InventoryList
  products={visibleProducts}
  selectedProductId={adjustment.productId}
  onAdjust={(product) =>
    setAdjustment({ ...initialAdjustment, productId: product.id })
  }
/>

<StockAdjustmentForm
  selectedProduct={products.find((product) => product.id === adjustment.productId)}
  value={adjustment}
  onChange={setAdjustment}
  onSubmit={(submission) => mutation.mutate(submission)}
  isSubmitting={mutation.isPending}
/>
```

## Performance design

- Only one responsive list is mounted at a time, so mobile and desktop do not duplicate every product node.
- Client pagination limits the active product DOM to 50 rows; filters and search still operate over the fetched working set.
- Searchable product text is normalized once per data change instead of allocating and lowercasing multiple strings per keystroke.
- The adjustment form receives one selected product instead of rendering the full catalog as select options.
- Stable callbacks and memoized leaf components prevent filter typing from reformatting metrics and activity timestamps.
- Inventory query data remains fresh for 30 seconds and cached for 10 minutes, reducing focus/mount refetch traffic.
- Successful mutations patch the cache immediately, end pending UI without waiting for a refetch, then reconcile in the background.
- Database metrics cover the full catalog, while stock changes use a row lock and one transaction for update plus audit insertion.

For catalogs larger than the current 500-item working set, replace client filtering with cursor-based server pagination and indexed server search. Preserve the component APIs: the route should continue supplying one bounded page to `InventoryList`.

## Production practices

- Keep network and cache behavior in the route/container; keep UI components controlled and deterministic.
- Preserve empty strings for numeric form inputs so users can clear a field without it snapping to zero.
- Validate on the client for feedback, but keep server-side schemas authoritative.
- Treat color as supplemental: every status and delta includes readable text or an accessible label.
- Pass real loading state to skeletons instead of rendering zero-valued metrics while data is unknown.
- Distinguish a genuinely empty catalog from a filtered result with no matches.
- Use the mobile card view below `md`; avoid compressing a five-column table into a narrow viewport.
- Move focus to the adjustment form when an action elsewhere on the page changes its context.
- Respect `prefers-reduced-motion` for programmatic scrolling and existing animations.
- Keep audit notes bounded and sanitize/validate them again at the server boundary.
- Keep stock changes transactional; never separate the quantity update from its audit insert.
- Profile before increasing page size. Prefer server cursors over rendering or retaining an unbounded catalog response.
