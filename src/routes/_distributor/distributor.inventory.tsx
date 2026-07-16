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
import {
  adjustDistributorInventory,
  getDistributorInventory,
  getMyStockRequests,
  requestStockTransfers,
} from "@/lib/distributors.functions";
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
  not_stocked: "border-slate-200 bg-slate-100 text-slate-600",
};

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
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
  // Batch stock request: quantities typed inline per product (keyed by
  // productId), submitted together — no per-item dialog. Values are strings so
  // an empty field stays blank instead of showing 0.
  const [requestQtys, setRequestQtys] = useState<Record<string, string>>({});
  const [batchNote, setBatchNote] = useState("");
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

  const { data: myRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["my-stock-requests"],
    queryFn: () => getMyStockRequests(),
  });

  const activeItem = data?.items.find((item) => item.id === activeItemId);

  const pendingRequests = Object.entries(requestQtys)
    .map(([productId, value]) => ({ productId, requestedQty: Math.floor(Number(value)) }))
    .filter((r) => Number.isFinite(r.requestedQty) && r.requestedQty >= 1);

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

  const batchRequestMutation = useMutation({
    mutationFn: () => {
      if (pendingRequests.length === 0) throw new Error("Enter a quantity for at least one product");
      return requestStockTransfers({ data: { items: pendingRequests, note: batchNote || null } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["distributor-inventory"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stock-requests"] });
      const count = result?.count ?? 0;
      setRequestQtys({});
      setBatchNote("");
      toast.success(`${count} stock request${count === 1 ? "" : "s"} sent`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Request failed"),
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
    <DistributorPageFrame
      title="Inventory"
      description="Track stock, log adjustments, and request more from the supply hub."
    >
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
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter a quantity in the “Request” column for anything you need, then send them all
                  at once.
                </p>
              </div>

              {pendingRequests.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-1 sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 shadow-md duration-200">
                  <div className="text-sm font-semibold text-primary">
                    {pendingRequests.length} product{pendingRequests.length === 1 ? "" : "s"} to request
                  </div>
                  <Input
                    value={batchNote}
                    onChange={(event) => setBatchNote(event.target.value)}
                    maxLength={300}
                    placeholder="Note for the hub (optional) — e.g. Weekly replenishment"
                    className="h-9 min-w-40 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequestQtys({})}
                    disabled={batchRequestMutation.isPending}
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={() => batchRequestMutation.mutate()}
                    disabled={batchRequestMutation.isPending}
                  >
                    {batchRequestMutation.isPending && <Loader2 className="animate-spin" />}
                    {batchRequestMutation.isPending
                      ? "Sending..."
                      : `Send ${pendingRequests.length} request${pendingRequests.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              )}

              <div className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Request</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                              {item.status === "not_stocked" ? "Not stocked" : item.stockQty}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={requestQtys[item.productId] ?? ""}
                              onChange={(event) =>
                                setRequestQtys((prev) => ({
                                  ...prev,
                                  [item.productId]: event.target.value,
                                }))
                              }
                              placeholder="0"
                              className="ml-auto h-8 w-20 text-right"
                              aria-label={`Request quantity for ${item.name}`}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            {item.id ? (
                              <Button variant="outline" size="sm" onClick={() => openAdjust(item.id!)}>
                                Adjust
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not stocked</span>
                            )}
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

          <section className="rounded-md border border-border bg-card p-4 shadow-sm">
            <h2 className="font-display text-lg font-semibold">My requests</h2>
            <p className="text-sm text-muted-foreground">Stock you've requested from the supply hub.</p>
            <div className="mt-3 overflow-hidden rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requestsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : myRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No requests yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    myRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="font-medium">{request.productName}</div>
                          <div className="text-xs text-muted-foreground">{request.unitLabel}</div>
                        </TableCell>
                        <TableCell className="text-right">{request.requestedQty}</TableCell>
                        <TableCell className="text-right">{request.approvedQty ?? "—"}</TableCell>
                        <TableCell>
                          <span
                            key={request.status}
                            className={`${badgeMotionRef.current ? "animate-badge-bump " : ""}rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${REQUEST_STATUS_BADGE[request.status]}`}
                          >
                            {request.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {request.status === "approved" && request.fulfilledByName && (
                            <div>Fulfilled by {request.fulfilledByName}</div>
                          )}
                          {request.status === "rejected" && request.adminNote && (
                            <div>{request.adminNote}</div>
                          )}
                          {request.note && <div className="text-xs italic">Note: {request.note}</div>}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
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
