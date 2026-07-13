import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  bulkSetProductActive,
  getAdminCatalog,
  updateProductRow,
} from "@/lib/admin.functions";

type CatalogProduct = Awaited<ReturnType<typeof getAdminCatalog>>["products"][number];

type RowEdit = {
  name: string;
  categoryId: string;
  priceRupees: number;
  unitLabel: string;
  stockQty: number;
  isActive: boolean;
  isFeatured: boolean;
};

type StatusFilter = "all" | "active" | "hidden" | "low" | "out";

function buildRow(product: CatalogProduct): RowEdit {
  return {
    name: product.name,
    categoryId: product.category_id ?? "__none",
    priceRupees: product.price_rupees,
    unitLabel: product.unit_label,
    stockQty: product.stock_qty,
    isActive: product.is_active,
    isFeatured: product.is_featured,
  };
}

function rowsEqual(a: RowEdit, b: RowEdit): boolean {
  return (
    a.name === b.name &&
    a.categoryId === b.categoryId &&
    a.priceRupees === b.priceRupees &&
    a.unitLabel === b.unitLabel &&
    a.stockQty === b.stockQty &&
    a.isActive === b.isActive &&
    a.isFeatured === b.isFeatured
  );
}

function toPayload(id: string, row: RowEdit) {
  return {
    id,
    name: row.name,
    categoryId: row.categoryId === "__none" ? null : row.categoryId,
    priceRupees: row.priceRupees,
    unitLabel: row.unitLabel,
    stockQty: row.stockQty,
    isActive: row.isActive,
    isFeatured: row.isFeatured,
  };
}

export const Route = createFileRoute("/_authenticated/admin/products-board")({
  head: () => ({ meta: [{ title: "Products board - FEABazaar" }] }),
  component: AdminProductsBoardPage,
});

function AdminProductsBoardPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [edits, setEdits] = useState<Record<string, RowEdit>>({});
  const [originals, setOriginals] = useState<Record<string, RowEdit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["admin-catalog"],
    queryFn: () => getAdminCatalog(),
  });

  const byId = useMemo(() => {
    const map = new Map<string, CatalogProduct>();
    (data?.products ?? []).forEach((product) => map.set(product.id, product));
    return map;
  }, [data?.products]);

  // Seed edit/original state for any product we don't already track, without
  // discarding in-progress edits on the rest of the board.
  useEffect(() => {
    if (!data) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const product of data.products) if (!next[product.id]) next[product.id] = buildRow(product);
      return next;
    });
    setOriginals((prev) => {
      const next = { ...prev };
      for (const product of data.products) if (!next[product.id]) next[product.id] = buildRow(product);
      return next;
    });
  }, [data]);

  const rowFor = (id: string): RowEdit => edits[id] ?? buildRow(byId.get(id)!);
  const setField = (id: string, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...rowFor(id), ...patch } }));
  const isDirty = (id: string) =>
    !!edits[id] && !!originals[id] && !rowsEqual(edits[id], originals[id]);

  const saveRow = useMutation({
    mutationFn: (vars: { id: string; row: RowEdit }) =>
      updateProductRow({ data: toPayload(vars.id, vars.row) }),
    onSuccess: (_result, vars) => {
      setOriginals((prev) => ({ ...prev, [vars.id]: vars.row }));
      toast.success("Saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const saveAll = useMutation({
    mutationFn: async (rows: { id: string; row: RowEdit }[]) => {
      await Promise.all(rows.map((entry) => updateProductRow({ data: toPayload(entry.id, entry.row) })));
      return rows;
    },
    onSuccess: (rows) => {
      setOriginals((prev) => {
        const next = { ...prev };
        rows.forEach((entry) => (next[entry.id] = entry.row));
        return next;
      });
      toast.success(`Saved ${rows.length} product${rows.length === 1 ? "" : "s"}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk save failed"),
  });

  const bulkActive = useMutation({
    mutationFn: (vars: { ids: string[]; isActive: boolean }) => bulkSetProductActive({ data: vars }),
    onSuccess: (_result, vars) => {
      const apply = (map: Record<string, RowEdit>) => {
        const next = { ...map };
        vars.ids.forEach((id) => {
          next[id] = { ...(next[id] ?? buildRow(byId.get(id)!)), isActive: vars.isActive };
        });
        return next;
      };
      setEdits(apply);
      setOriginals(apply);
      setSelected(new Set());
      toast.success(`${vars.ids.length} product${vars.ids.length === 1 ? "" : "s"} ${vars.isActive ? "activated" : "hidden"}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return (data?.products ?? []).filter((product) => {
      const matchesSearch =
        !query ||
        [product.name, product.slug, product.categories?.name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      if (!matchesSearch) return false;
      switch (statusFilter) {
        case "active":
          return product.is_active;
        case "hidden":
          return !product.is_active;
        case "low":
          return product.stock_qty > 0 && product.stock_qty <= 10;
        case "out":
          return product.stock_qty <= 0;
        default:
          return true;
      }
    });
  }, [data?.products, search, statusFilter]);

  const dirtyRows = useMemo(
    () =>
      (data?.products ?? [])
        .filter((product) => isDirty(product.id))
        .map((product) => ({ id: product.id, row: edits[product.id] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.products, edits, originals],
  );

  const filteredIds = filtered.map((product) => product.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const toggleSelectAll = () => {
    setSelected(() => (allSelected ? new Set() : new Set(filteredIds)));
  };
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categories = data?.categories ?? [];
  const selectedIds = [...selected];

  return (
    <AdminPageFrame
      title="Products board"
      description="Edit names, prices, categories, and stock inline. Stock changes are logged to inventory."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Products could not load."}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3 shadow-sm">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="h-9 w-full sm:w-64"
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All products</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="hidden">Hidden</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEdits({});
                  setOriginals({});
                  setSelected(new Set());
                  queryClient.invalidateQueries({ queryKey: ["admin-catalog"] });
                }}
                disabled={isFetching}
                title="Discard changes & refresh from server"
              >
                <RefreshCw className={isFetching ? "animate-spin" : ""} />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/products">Add / full edit</Link>
              </Button>
              <Button
                size="sm"
                onClick={() => saveAll.mutate(dirtyRows)}
                disabled={dirtyRows.length === 0 || saveAll.isPending}
              >
                <Save />
                {saveAll.isPending ? "Saving..." : `Save all (${dirtyRows.length})`}
              </Button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">{selectedIds.length} selected</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkActive.mutate({ ids: selectedIds, isActive: true })}
                disabled={bulkActive.isPending}
              >
                <Eye /> Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkActive.mutate({ ids: selectedIds, isActive: false })}
                disabled={bulkActive.isPending}
              >
                <EyeOff /> Hide
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-md border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[200px]">Product</TableHead>
                  <TableHead className="min-w-[150px]">Category</TableHead>
                  <TableHead className="w-28 text-right">Price (₹)</TableHead>
                  <TableHead className="w-28">Unit</TableHead>
                  <TableHead className="w-24 text-right">Stock</TableHead>
                  <TableHead className="w-20 text-center">Active</TableHead>
                  <TableHead className="w-20 text-center">Featured</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No products found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((product) => {
                    const row = rowFor(product.id);
                    const dirty = isDirty(product.id);
                    return (
                      <TableRow key={product.id} className={dirty ? "bg-amber-50/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(product.id)}
                            onCheckedChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.name}
                            onChange={(event) => setField(product.id, { name: event.target.value })}
                            className="h-8"
                          />
                          <div className="mt-1 text-xs text-muted-foreground">{product.slug}</div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.categoryId}
                            onValueChange={(value) => setField(product.id, { categoryId: value })}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">No category</SelectItem>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.priceRupees}
                            onChange={(event) =>
                              setField(product.id, { priceRupees: Number(event.target.value) })
                            }
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={row.unitLabel}
                            onChange={(event) => setField(product.id, { unitLabel: event.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={row.stockQty}
                            onChange={(event) =>
                              setField(product.id, { stockQty: Number(event.target.value) })
                            }
                            className="h-8 text-right"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={row.isActive}
                            onCheckedChange={(isActive) => setField(product.id, { isActive })}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={row.isFeatured}
                            onCheckedChange={(isFeatured) => setField(product.id, { isFeatured })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant={dirty ? "default" : "ghost"}
                            size="icon"
                            className="h-8 w-8"
                            title="Save row"
                            disabled={!dirty || saveRow.isPending}
                            onClick={() => saveRow.mutate({ id: product.id, row })}
                          >
                            <Save className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            Edited rows are highlighted. Save each row, or use “Save all”. Slugs are fixed here —
            use the Catalog page to change a slug or create a product.
          </p>
        </div>
      )}
    </AdminPageFrame>
  );
}
