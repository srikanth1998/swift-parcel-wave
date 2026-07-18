import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, Mail, Phone, Plus, UserMinus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addServiceArea,
  assignDistributorUser,
  bulkApproveStockTransferRequests,
  getAdminDistributors,
  getAdminDistributorUsers,
  getSupplierRequests,
  removeDistributorUser,
  removeServiceArea,
  reviewStockTransferRequest,
  upsertAdminDistributor,
} from "@/lib/distributors.functions";

type AdminDistributor = Awaited<ReturnType<typeof getAdminDistributors>>[number];
type AdminDistributorUser = Awaited<ReturnType<typeof getAdminDistributorUsers>>[number];
type SupplierRequest = Awaited<ReturnType<typeof getSupplierRequests>>[number];
type ReviewAction = "approve" | "reject";

type DistributorForm = {
  id?: string;
  name: string;
  contactPhone: string;
  contactEmail: string;
  isActive: boolean;
  canSupply: boolean;
};

const emptyDistributor: DistributorForm = {
  name: "",
  contactPhone: "",
  contactEmail: "",
  isActive: true,
  canSupply: false,
};

const PINCODE_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Route = createFileRoute("/_authenticated/admin/distributors")({
  head: () => ({ meta: [{ title: "Distributors - FEABazaar" }] }),
  component: AdminDistributorsPage,
});

function AdminDistributorsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DistributorForm>(emptyDistributor);
  const [reviewTarget, setReviewTarget] = useState<{
    request: SupplierRequest;
    action: ReviewAction;
  } | null>(null);
  const [approvedQty, setApprovedQty] = useState(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(() => new Set());
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  // Avoid firing the badge-bump animation on first paint — only later
  // (real) state changes should replay it.
  const badgeMotionRef = useRef(false);
  useEffect(() => {
    badgeMotionRef.current = true;
  }, []);

  const {
    data: distributors = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["admin-distributors"],
    queryFn: () => getAdminDistributors(),
  });

  const { data: distributorUsers = [] } = useQuery({
    queryKey: ["admin-distributor-users"],
    queryFn: () => getAdminDistributorUsers(),
  });

  const {
    data: supplierRequests = [],
    isLoading: requestsLoading,
    error: requestsError,
  } = useQuery({
    queryKey: ["supplier-requests"],
    queryFn: () => getSupplierRequests(),
  });

  const pendingRequests = useMemo(
    () => supplierRequests.filter((request) => request.status === "pending"),
    [supplierRequests],
  );
  const selectedRequests = useMemo(
    () => pendingRequests.filter((request) => selectedRequestIds.has(request.id)),
    [pendingRequests, selectedRequestIds],
  );
  const allPendingSelected =
    pendingRequests.length > 0 && selectedRequests.length === pendingRequests.length;
  const selectedRequestedQty = selectedRequests.reduce(
    (total, request) => total + request.requestedQty,
    0,
  );

  useEffect(() => {
    const pendingIds = new Set(pendingRequests.map((request) => request.id));
    setSelectedRequestIds((current) => {
      const next = new Set([...current].filter((id) => pendingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [pendingRequests]);

  const upsertMutation = useMutation({
    mutationFn: (input: DistributorForm) =>
      upsertAdminDistributor({
        data: {
          id: input.id,
          name: input.name,
          contactPhone: input.contactPhone || null,
          contactEmail: input.contactEmail || null,
          isActive: input.isActive,
          canSupply: input.canSupply,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributors"] });
      setForm(emptyDistributor);
      toast.success("Distributor saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (input: {
      id: string;
      name: string;
      contactPhone: string | null;
      contactEmail: string | null;
      isActive: boolean;
      canSupply: boolean;
    }) =>
      upsertAdminDistributor({
        data: {
          id: input.id,
          name: input.name,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          isActive: input.isActive,
          canSupply: input.canSupply,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributors"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
  });

  const addAreaMutation = useMutation({
    mutationFn: (input: { distributorId: string; pincode: string }) => addServiceArea({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributors"] });
      toast.success("Pincode added");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add pincode"),
  });

  const removeAreaMutation = useMutation({
    mutationFn: (input: { id: string }) => removeServiceArea({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributors"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove pincode"),
  });

  const assignUserMutation = useMutation({
    mutationFn: (input: { email: string; distributorId: string }) => assignDistributorUser({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributor-users"] });
      toast.success("Operator assigned");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not assign operator"),
  });

  const removeUserMutation = useMutation({
    mutationFn: (input: { userId: string }) => removeDistributorUser({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-distributor-users"] });
      toast.success("Operator removed");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove operator"),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: {
      requestId: string;
      action: ReviewAction;
      approvedQty?: number;
      fulfilledByDistributorId?: string;
      adminNote: string;
    }) =>
      reviewStockTransferRequest({
        data: {
          requestId: input.requestId,
          action: input.action,
          approvedQty: input.action === "approve" ? input.approvedQty : undefined,
          fulfilledByDistributorId: input.action === "approve" ? input.fulfilledByDistributorId : undefined,
          adminNote: input.adminNote || null,
        },
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["supplier-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-distributors"] });
      setReviewTarget(null);
      toast.success(variables.action === "approve" ? "Request approved" : "Request rejected");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not review request"),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (requestIds: string[]) =>
      bulkApproveStockTransferRequests({ data: { requestIds } }),
    onSuccess: async ({ approvedCount }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supplier-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-distributors"] }),
      ]);
      setSelectedRequestIds(new Set());
      setBulkApproveOpen(false);
      toast.success(
        `${approvedCount} stock ${approvedCount === 1 ? "request" : "requests"} approved`,
      );
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not approve selected requests"),
  });

  function setRequestSelected(requestId: string, selected: boolean) {
    setSelectedRequestIds((current) => {
      const next = new Set(current);
      if (selected) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  }

  function setAllPendingSelected(selected: boolean) {
    setSelectedRequestIds(
      selected ? new Set(pendingRequests.map((request) => request.id)) : new Set(),
    );
  }

  function openReview(request: SupplierRequest, action: ReviewAction) {
    const sourceWithEnoughStock = request.supplierOptions.find(
      (source) => source.stockQty >= request.requestedQty,
    );
    const sourceWithSomeStock = request.supplierOptions.find((source) => source.stockQty > 0);
    const defaultSource =
      sourceWithEnoughStock ?? sourceWithSomeStock ?? request.supplierOptions[0];

    setSelectedSupplierId(action === "approve" ? (defaultSource?.distributorId ?? "") : "");
    setApprovedQty(
      action === "approve" && defaultSource
        ? Math.min(request.requestedQty, defaultSource.stockQty)
        : request.requestedQty,
    );
    setAdminNote("");
    setReviewTarget({ request, action });
  }

  const selectedSupplier = reviewTarget?.request.supplierOptions.find(
    (source) => source.distributorId === selectedSupplierId,
  );
  const availableSupplierStock = selectedSupplier?.stockQty ?? 0;
  const approvalExceedsStock = approvedQty > availableSupplierStock;

  return (
    <AdminPageFrame
      title="Distributors"
      description="Manage regional distributors, their pincode coverage, and operator accounts."
    >
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Distributors could not load."}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <section className="h-fit rounded-md border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">
                {form.id ? "Edit distributor" : "New distributor"}
              </h2>
              {form.id && (
                <Button variant="outline" size="sm" onClick={() => setForm(emptyDistributor)}>
                  <Plus />
                  New
                </Button>
              )}
            </div>
            <form
              className="mt-4 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                upsertMutation.mutate(form);
              }}
            >
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="North Bengaluru Distribution"
                  required
                  minLength={1}
                  maxLength={120}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact phone">
                  <Input
                    value={form.contactPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, contactPhone: event.target.value }))
                    }
                    placeholder="+91 98765 43210"
                    maxLength={30}
                  />
                </Field>
                <Field label="Contact email">
                  <Input
                    type="email"
                    value={form.contactEmail}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, contactEmail: event.target.value }))
                    }
                    placeholder="ops@distributor.com"
                    maxLength={255}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
                />
                Active
              </label>
              <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Switch
                  checked={form.canSupply}
                  onCheckedChange={(canSupply) => setForm((current) => ({ ...current, canSupply }))}
                />
                Can supply other distributors
              </label>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="animate-spin" />}
                {upsertMutation.isPending ? "Saving..." : "Save distributor"}
              </Button>
            </form>
          </section>

          <section className="space-y-4">
            {isLoading ? (
              <div className="rounded-md border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
                Loading...
              </div>
            ) : distributors.length === 0 ? (
              <div className="rounded-md border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
                No distributors yet.
              </div>
            ) : (
              distributors.map((distributor) => {
                const operators = distributorUsers.filter((u) => u.distributorId === distributor.id);
                return (
                  <DistributorCard
                    key={distributor.id}
                    distributor={distributor}
                    operators={operators}
                    badgeMotion={badgeMotionRef.current}
                    onEdit={() =>
                      setForm({
                        id: distributor.id,
                        name: distributor.name,
                        contactPhone: distributor.contact_phone ?? "",
                        contactEmail: distributor.contact_email ?? "",
                        isActive: distributor.is_active,
                        canSupply: distributor.can_supply,
                      })
                    }
                    onToggleActive={(isActive) =>
                      toggleActiveMutation.mutate({
                        id: distributor.id,
                        name: distributor.name,
                        contactPhone: distributor.contact_phone,
                        contactEmail: distributor.contact_email,
                        isActive,
                        canSupply: distributor.can_supply,
                      })
                    }
                    toggleActivePending={
                      toggleActiveMutation.isPending &&
                      toggleActiveMutation.variables?.id === distributor.id
                    }
                    onAddArea={(pincode) => addAreaMutation.mutate({ distributorId: distributor.id, pincode })}
                    addAreaPending={
                      addAreaMutation.isPending && addAreaMutation.variables?.distributorId === distributor.id
                    }
                    onRemoveArea={(id) => removeAreaMutation.mutate({ id })}
                    removingAreaId={
                      removeAreaMutation.isPending ? (removeAreaMutation.variables?.id ?? null) : null
                    }
                    onAssignUser={(email) => assignUserMutation.mutate({ email, distributorId: distributor.id })}
                    assignUserPending={
                      assignUserMutation.isPending &&
                      assignUserMutation.variables?.distributorId === distributor.id
                    }
                    onRemoveUser={(userId) => removeUserMutation.mutate({ userId })}
                    removingUserId={
                      removeUserMutation.isPending ? (removeUserMutation.variables?.userId ?? null) : null
                    }
                  />
                );
              })
            )}
          </section>
        </div>
      )}

      <section className="animate-in fade-in slide-in-from-bottom-1 mt-6 overflow-hidden rounded-md border border-border bg-card shadow-sm duration-300 ease-out fill-mode-both">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Pending stock requests</h2>
            <p className="text-sm text-muted-foreground">
              Review and fulfil stock transfer requests from any distributor.
            </p>
          </div>
          <Button
            type="button"
            disabled={selectedRequests.length === 0 || bulkApproveMutation.isPending}
            onClick={() => setBulkApproveOpen(true)}
          >
            {bulkApproveMutation.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Check />
            )}
            Approve selected{selectedRequests.length > 0 ? ` (${selectedRequests.length})` : ""}
          </Button>
        </div>
        {requestsError ? (
          <div className="p-4 text-sm text-destructive">
            {requestsError instanceof Error ? requestsError.message : "Requests could not load."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      allPendingSelected
                        ? true
                        : selectedRequests.length > 0
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(checked) => setAllPendingSelected(checked === true)}
                    disabled={pendingRequests.length === 0 || bulkApproveMutation.isPending}
                    aria-label="Select all pending stock requests"
                  />
                </TableHead>
                <TableHead>Distributor</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Requested at</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestsLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : pendingRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No pending requests.
                  </TableCell>
                </TableRow>
              ) : (
                pendingRequests.map((request) => (
                  <TableRow
                    key={request.id}
                    data-state={selectedRequestIds.has(request.id) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedRequestIds.has(request.id)}
                        onCheckedChange={(checked) =>
                          setRequestSelected(request.id, checked === true)
                        }
                        disabled={bulkApproveMutation.isPending}
                        aria-label={`Select ${request.productName} request from ${request.requestingDistributorName}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{request.requestingDistributorName}</TableCell>
                    <TableCell>
                      <div className="font-medium">{request.productName}</div>
                      <div className="text-xs text-muted-foreground">{request.unitLabel}</div>
                    </TableCell>
                    <TableCell className="text-right">{request.requestedQty}</TableCell>
                    <TableCell className="max-w-56 truncate text-sm text-muted-foreground">
                      {request.note || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(request.requestedAt), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReview(request, "reject")}
                          disabled={bulkApproveMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openReview(request, "approve")}
                          disabled={bulkApproveMutation.isPending}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </section>

      <Dialog
        open={bulkApproveOpen}
        onOpenChange={(open) => !bulkApproveMutation.isPending && setBulkApproveOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve selected requests?</DialogTitle>
            <DialogDescription>
              This will send the full requested quantity for {selectedRequests.length}{" "}
              {selectedRequests.length === 1 ? "request" : "requests"} from FEABazaar — Main
              Warehouse ({selectedRequestedQty} total units).
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The batch is all-or-nothing. If warehouse stock cannot fulfil every selected request,
            none of them will be approved.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkApproveOpen(false)}
              disabled={bulkApproveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() =>
                bulkApproveMutation.mutate(selectedRequests.map((request) => request.id))
              }
              disabled={selectedRequests.length === 0 || bulkApproveMutation.isPending}
            >
              {bulkApproveMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              {bulkApproveMutation.isPending ? "Approving..." : "Approve all selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewTarget !== null} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewTarget?.action === "approve" ? "Approve request" : "Reject request"}</DialogTitle>
            <DialogDescription>
              {reviewTarget
                ? `${reviewTarget.request.requestingDistributorName} requested ${reviewTarget.request.requestedQty} ${reviewTarget.request.unitLabel} of ${reviewTarget.request.productName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reviewTarget) return;
              reviewMutation.mutate({
                requestId: reviewTarget.request.id,
                action: reviewTarget.action,
                approvedQty: reviewTarget.action === "approve" ? approvedQty : undefined,
                fulfilledByDistributorId:
                  reviewTarget.action === "approve" ? selectedSupplierId : undefined,
                adminNote,
              });
            }}
          >
            {reviewTarget?.action === "approve" && (
              <>
                <Field label="Source warehouse">
                  <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                    <SelectTrigger aria-label="Source warehouse">
                      <SelectValue placeholder="Choose a warehouse" />
                    </SelectTrigger>
                    <SelectContent>
                      {reviewTarget.request.supplierOptions.map((source) => (
                        <SelectItem key={source.distributorId} value={source.distributorId}>
                          {source.name} — {source.stockQty} available
                          {source.canSupply ? " (supply hub)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stock is checked against this warehouse, not the global catalog quantity.
                  </p>
                </Field>
                <Field label="Quantity to send">
                  <Input
                    type="number"
                    min={1}
                    max={availableSupplierStock || undefined}
                    value={approvedQty}
                    onChange={(event) => setApprovedQty(Number(event.target.value))}
                    aria-describedby="supplier-stock-help"
                    aria-invalid={approvalExceedsStock}
                    required
                  />
                  <p
                    id="supplier-stock-help"
                    className={
                      approvalExceedsStock
                        ? "mt-1 text-xs text-destructive"
                        : "mt-1 text-xs text-muted-foreground"
                    }
                  >
                    {selectedSupplier
                      ? approvalExceedsStock
                        ? `${selectedSupplier.name} only has ${availableSupplierStock} available.`
                        : `${availableSupplierStock} available at ${selectedSupplier.name}.`
                      : "Choose a source warehouse to view its available stock."}
                  </p>
                </Field>
              </>
            )}
            <Field label="Note (optional)">
              <Input
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                maxLength={300}
                placeholder={
                  reviewTarget?.action === "approve"
                    ? "e.g. Sending partial quantity, rest next week"
                    : "e.g. Out of stock right now"
                }
              />
            </Field>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  reviewMutation.isPending ||
                  (reviewTarget?.action === "approve" &&
                    (!approvedQty ||
                      approvedQty < 1 ||
                      !selectedSupplierId ||
                      approvalExceedsStock))
                }
              >
                {reviewMutation.isPending && <Loader2 className="animate-spin" />}
                {reviewTarget?.action === "approve" ? "Approve request" : "Reject request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminPageFrame>
  );
}

function DistributorCard({
  distributor,
  operators,
  badgeMotion,
  onEdit,
  onToggleActive,
  toggleActivePending,
  onAddArea,
  addAreaPending,
  onRemoveArea,
  removingAreaId,
  onAssignUser,
  assignUserPending,
  onRemoveUser,
  removingUserId,
}: {
  distributor: AdminDistributor;
  operators: AdminDistributorUser[];
  badgeMotion: boolean;
  onEdit: () => void;
  onToggleActive: (isActive: boolean) => void;
  toggleActivePending: boolean;
  onAddArea: (pincode: string) => void;
  addAreaPending: boolean;
  onRemoveArea: (id: string) => void;
  removingAreaId: string | null;
  onAssignUser: (email: string) => void;
  assignUserPending: boolean;
  onRemoveUser: (userId: string) => void;
  removingUserId: string | null;
}) {
  const [pincodeInput, setPincodeInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const pincodeValid = PINCODE_RE.test(pincodeInput.trim());
  const emailValid = EMAIL_RE.test(emailInput.trim());

  return (
    <div className="rounded-md border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold">{distributor.name}</h3>
            <span
              key={distributor.is_active ? "active" : "inactive"}
              className={`${badgeMotion ? "animate-badge-bump " : ""}rounded-md border px-2 py-0.5 text-xs font-semibold ${
                distributor.is_active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-600"
              }`}
            >
              {distributor.is_active ? "Active" : "Inactive"}
            </span>
            {distributor.can_supply && (
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
                Hub
              </Badge>
            )}
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
            {distributor.contact_phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {distributor.contact_phone}
              </div>
            )}
            {distributor.contact_email && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {distributor.contact_email}
              </div>
            )}
            <div>Added {format(new Date(distributor.created_at), "MMM d, yyyy")}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={distributor.is_active} disabled={toggleActivePending} onCheckedChange={onToggleActive} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Service pincodes</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {distributor.serviceAreas.length === 0 ? (
              <span className="text-sm text-muted-foreground">No coverage yet.</span>
            ) : (
              distributor.serviceAreas.map((area) => (
                <span
                  key={area.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium"
                >
                  {area.pincode}
                  <button
                    type="button"
                    className="rounded-sm text-muted-foreground transition-colors duration-150 hover:text-destructive disabled:opacity-50"
                    disabled={removingAreaId === area.id}
                    onClick={() => onRemoveArea(area.id)}
                    aria-label={`Remove pincode ${area.pincode}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pincodeValid) return;
              onAddArea(pincodeInput.trim());
              setPincodeInput("");
            }}
          >
            <Input
              value={pincodeInput}
              onChange={(event) => setPincodeInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="560001"
              inputMode="numeric"
              className="h-8 text-sm"
              aria-label="Add pincode"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!pincodeValid || addAreaPending}>
              {addAreaPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
          </form>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">Operators</div>
          <div className="mt-2 space-y-1.5">
            {operators.length === 0 ? (
              <span className="text-sm text-muted-foreground">No operator assigned.</span>
            ) : (
              operators.map((op) => (
                <div
                  key={op.userId}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{op.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{op.email ?? "—"}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={removingUserId === op.userId}
                    onClick={() => onRemoveUser(op.userId)}
                    aria-label={`Remove ${op.name}`}
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!emailValid) return;
              onAssignUser(emailInput.trim());
              setEmailInput("");
            }}
          >
            <Input
              type="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="operator@example.com"
              className="h-8 text-sm"
              aria-label="Assign operator by email"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!emailValid || assignUserPending}>
              {assignUserPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Assign
            </Button>
          </form>
        </div>
      </div>
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
