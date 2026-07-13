import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Boxes, PackageX, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { adjustInventory, getAdminInventory } from "@/lib/inventory.functions";
import { formatCents } from "@/lib/format";

type Mode = "set" | "delta";
type Reason = "restock" | "correction" | "damage" | "return";

const REASON_LABEL: Record<Reason, string> = {
  restock: "Restock",
  correction: "Correction",
  damage: "Damage / loss",
  return: "Customer return",
};

const STATUS_BADGE: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  low: "border-amber-200 bg-amber-50 text-amber-700",
  out: "border-red-200 bg-red-50 text-red-700",
};

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  head: () => ({ meta: [{ title: "Inventory - FEABazaar" }] }),
  component: AdminInventoryPage,
});

function AdminInventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [mode, setMode] = useState<Mode>("delta");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState<Reason>("restock");
  const [note, setNote] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => getAdminInventory(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      adjustInventory({
        data: { productId, mode, amount, reason, note: note || null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-inventory"] });
      setAmount(0);
      setNote("");
      toast.success("Stock updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Adjustment failed"),
  });

  const products = useMemo(() => {
    const query = search.toLowerCase();
    return (data?.products ?? []).filter((product) => {
      if (!query) return true;
      return [product.name, product.slug, product.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data?.products, search]);

  const selectedProduct = data?.products.find((product) => product.id === productId);

  return (
    <AdminPageFrame title="Inventory" description="Track stock levels and log every adjustment.">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Inventory could not load."}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Layers} label="Products" value={data?.stats.totalProducts ?? 0} />
            <Metric icon={AlertTriangle} label="Low stock" value={data?.stats.lowStock ?? 0} />
            <Metric icon={PackageX} label="Out of stock" value={data?.stats.outOfStock ?? 0} />
            <Metric icon={Boxes} label="Units on hand" value={data?.stats.totalUnits ?? 0} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="space-y-4">
              <div className="rounded-md border border-border bg-card p-4 shadow-sm">
                <h2 className="font-display text-xl font-semibold">Adjust stock</h2>
                <form
                  className="mt-4 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!productId) {
                      toast.error("Pick a product first");
                      return;
                    }
                    mutation.mutate();
                  }}
                >
                  <Field label="Product">
                    <Select value={productId} onValueChange={setProductId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent>
                        {(data?.products ?? []).map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} · {product.stockQty} on hand
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Mode">
                      <Select value={mode} onValueChange={(value) => setMode(value as Mode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="delta">Add / remove</SelectItem>
                          <SelectItem value="set">Set exact</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={mode === "set" ? "New quantity" : "Change (+/-)"}>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(event) => setAmount(Number(event.target.value))}
                        required
                      />
                    </Field>
                  </div>
                  {selectedProduct && (
                    <p className="text-xs text-muted-foreground">
                      {selectedProduct.name}: {selectedProduct.stockQty} →{" "}
                      <span className="font-medium text-foreground">
                        {mode === "set"
                          ? Math.max(amount, 0)
                          : Math.max(selectedProduct.stockQty + amount, 0)}
                      </span>
                    </p>
                  )}
                  <Field label="Reason">
                    <Select value={reason} onValueChange={(value) => setReason(value as Reason)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(REASON_LABEL) as Reason[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {REASON_LABEL[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Note (optional)">
                    <Input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={300}
                      placeholder="e.g. Received PO #1234"
                    />
                  </Field>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Saving..." : "Apply adjustment"}
                  </Button>
                </form>
              </div>

              <div className="rounded-md border border-border bg-card p-4 shadow-sm">
                <h2 className="font-display text-lg font-semibold">Recent adjustments</h2>
                <div className="mt-3 space-y-2">
                  {(data?.recentAdjustments ?? []).length === 0 ? (
                    <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      No adjustments yet.
                    </div>
                  ) : (
                    (data?.recentAdjustments ?? []).map((adjustment) => (
                      <div
                        key={adjustment.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{adjustment.productName}</div>
                          <div className="text-xs capitalize text-muted-foreground">
                            {adjustment.reason} · {format(new Date(adjustment.created_at), "MMM d, h:mm a")}
                          </div>
                        </div>
                        <div
                          className={`shrink-0 font-mono text-sm font-semibold ${
                            adjustment.delta >= 0 ? "text-emerald-700" : "text-red-700"
                          }`}
                        >
                          {adjustment.delta >= 0 ? "+" : ""}
                          {adjustment.delta}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            → {adjustment.new_qty}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-md border border-border bg-card p-4 shadow-sm">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products"
                />
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : products.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">{product.unitLabel}</div>
                          </TableCell>
                          <TableCell>{product.category ?? "None"}</TableCell>
                          <TableCell className="text-right">{formatCents(product.priceCents)}</TableCell>
                          <TableCell className="text-right">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[product.status]}`}
                            >
                              {product.stockQty}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setProductId(product.id);
                                setMode("delta");
                                setAmount(0);
                              }}
                            >
                              Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminPageFrame>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
