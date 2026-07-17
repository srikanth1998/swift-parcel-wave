export type InventoryStatus = "ok" | "low" | "out";

export type InventoryProduct = {
  id: string;
  name: string;
  slug: string;
  unitLabel: string;
  isActive: boolean;
  priceCents: number;
  stockQty: number;
  category: string | null;
  status: InventoryStatus;
};

export type InventoryAdjustment = {
  id: string;
  product_id: string;
  productName: string;
  delta: number;
  previous_qty: number;
  new_qty: number;
  reason: string;
  note: string | null;
  created_at: string;
};

export type InventoryStats = {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
};

export type InventoryFilterStatus = "all" | InventoryStatus;
export type InventorySort = "stock-asc" | "stock-desc" | "name-asc" | "name-desc";

export type InventoryFilters = {
  query: string;
  status: InventoryFilterStatus;
  category: string | null;
  sort: InventorySort;
};

export type AdjustmentMode = "set" | "delta";
export type AdjustmentReason = "restock" | "correction" | "damage" | "return";

export type AdjustmentFormValue = {
  productId: string;
  mode: AdjustmentMode;
  amount: string;
  reason: AdjustmentReason;
  note: string;
};

export type AdjustmentSubmission = Omit<AdjustmentFormValue, "amount"> & {
  amount: number;
};
