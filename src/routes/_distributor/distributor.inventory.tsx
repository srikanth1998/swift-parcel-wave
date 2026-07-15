import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Boxes, Layers, Loader2, PackageX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { toast } from "sonner";
import { DistributorPageFrame } from "@/components/distributor-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { adjustDistributorInventory, getDistributorInventory } from "@/lib/distributors.functions";
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

export const Route = createFileRoute("/_distributor/distributor/inventory")({
  head: () => ({ meta: [{ title: "Inventory - FEABazaar distributor" }] }),
  component: DistributorInventoryPage,
});

function DistributorInventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("delta");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState<Reason>("restock");
  const [note, setNote] = useState("");
  // Status pills should only "bump" in response to a real change, not on the
  // table's first paint (which would fire the animation on every visible row
  // at once). This flips true after mount, so only later re-renders animate.
  const badgeMotionRef = useRef(false);
  useEffect(() => {
    badgeMotionRef.current = true;
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["distributor-inventory"],
    queryFn: () => getDistributorInventory(),
  });

  const activeItem = data?.items.find((item) => item.id === activeItemId);

  const mutation = useMutation({
    mutationFn: () => {
      if (!activeItem) throw new Error("Pick a product first");
      return adjustDistributorInventory({
        data: { productId: activeItem.productId, mode, amount, reason, note: note || null },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["distributor-inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["distributor-overview"] });
      setActiveItemId(null);
      setAmount(0);
      setNote("");
      toast.success("Stock updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Adjustment failed"),
  });

  const items = (data?.items ?? []).filter((item) => {
    const query = search.toLowerCase();
    if (!query) return true;
    return [item.name, item.slug, item.category].filter(Boolean).some((value) =>
      String(value).toLowerCase().includes(query),
    );
  });

  function openAdjust(itemId: string) {
    setActiveItemId(itemId);
    setMode("delta");
    setAmount(0);
    setReason("restock");
    setNote("");
  }

  return (
    <DistributorPageFrame title="Inventory" description="Track your stock levels and log every adjustment.">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Inventory could not load."}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 space-y-6 duration-300 ease-out fill-mode-both">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Layers} label="Items" value={data?.stats.totalItems ?? 0} />
            <Metric icon={AlertTriangle} label="Low stock" value={data?.stats.lowStock ?? 0} />
            <Metric icon={PackageX} label="Out of stock" value={data?.stats.outOfStock ?? 0} />
            <Metric icon={Boxes} label="Units on hand" value={data?.stats.totalUnits ?? 0} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
            <section className="space-y-4">
              <div className="rounded-md border border-border bg-card p-4 shadow-sm">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search items"
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
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                          No items found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.unitLabel}</div>
                          </TableCell>
                          <TableCell>{item.category ?? "None"}</TableCell>
                          <TableCell className="text-right">{formatCents(item.priceCents)}</TableCell>
                          <TableCell className="text-right">
                            <span
                              key={item.status}
                              className={`${badgeMotionRef.current ? "animate-badge-bump " : ""}rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[item.status]}`}
                            >
                              {item.stockQty}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => openAdjust(item.id)}>
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

            <section className="rounded-md border border-border bg-card p-4 shadow-sm">
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
            </section>
          </div>
        </div>
      )}

      <Dialog open={activeItemId !== null} onOpenChange={(open) => !open && setActiveItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {activeItem ? `${activeItem.name} · ${activeItem.stockQty} on hand` : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
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
            {activeItem && (
              <p className="text-xs text-muted-foreground">
                {activeItem.name}: {activeItem.stockQty} →{" "}
                <span className="font-medium text-foreground">
                  {mode === "set" ? Math.max(amount, 0) : Math.max(activeItem.stockQty + amount, 0)}
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
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="animate-spin" />}
                {mutation.isPending ? "Saving..." : "Apply adjustment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DistributorPageFrame>
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
