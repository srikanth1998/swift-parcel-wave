# Inventory UI system

The inventory route is the orchestration layer: it owns React Query, mutations, filters, and selected-product state. Components in this directory are controlled, domain-typed, and do not fetch data, which makes them reusable in admin, distributor, and catalog-management surfaces.

## Architecture

| Component | Responsibility |
| --- | --- |
| `InventoryMetrics` | Summary KPIs with loading skeletons and semantic `dl` markup |
| `InventoryToolbar` | Controlled search, status/category filters, sorting, reset, and result announcements |
| `InventoryList` | Desktop table, mobile cards, loading skeletons, and filtered/unfiltered empty states |
| `InventoryStatusBadge` | Consistent, text-backed stock status presentation |
| `StockAdjustmentForm` | Controlled adjustment workflow, validation, quantity preview, and pending/error states |
| `InventoryActivity` | Keyboard-accessible audit history with positive/negative change semantics |
| `InventoryErrorState` | Recoverable query error with retry action |
| `types.ts` | Shared product, adjustment, filter, form, and submission contracts |

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
  products: InventoryProduct[];
  value: AdjustmentFormValue;
  onChange: (value: AdjustmentFormValue) => void;
  onSubmit: (value: AdjustmentSubmission) => void;
  isSubmitting?: boolean;
  disabled?: boolean;
  submissionError?: string | null;
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
  products={products}
  value={adjustment}
  onChange={setAdjustment}
  onSubmit={(submission) => mutation.mutate(submission)}
  isSubmitting={mutation.isPending}
/>
```

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
