import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDistributorOverview,
  getSupplierRequests,
  reviewStockTransferRequest,
} from "@/lib/distributors.functions";

type SupplierRequest = Awaited<ReturnType<typeof getSupplierRequests>>[number];
type ReviewAction = "approve" | "reject";

const REQUEST_STATUS_BADGE: Record<string, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
};

export const Route = createFileRoute("/_distributor/distributor/requests")({
  head: () => ({ meta: [{ title: "Stock requests - FEABazaar distributor" }] }),
  component: DistributorRequestsPage,
});

function DistributorRequestsPage() {
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery({
    queryKey: ["distributor-overview"],
    queryFn: () => getDistributorOverview(),
  });

  const isHub = overview?.distributor?.can_supply === true;

  return (
    <DistributorPageFrame
      title="Stock requests"
      description="Review and fulfil stock transfer requests from other distributors."
    >
      {overviewError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {overviewError instanceof Error ? overviewError.message : "Could not load your distributor."}
        </div>
      ) : overviewLoading || !overview ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : !isHub || !overview.distributor ? (
        <div className="rounded-md border border-border bg-card p-10 text-center text-muted-foreground shadow-sm">
          This section is only available to supply hub distributors.
        </div>
      ) : (
        <SupplierRequestsQueue hubDistributorId={overview.distributor.id} />
      )}
    </DistributorPageFrame>
  );
}

function SupplierRequestsQueue({ hubDistributorId }: { hubDistributorId: string }) {
  const queryClient = useQueryClient();
  const [reviewTarget, setReviewTarget] = useState<{
    request: SupplierRequest;
    action: ReviewAction;
  } | null>(null);
  const [approvedQty, setApprovedQty] = useState(1);
  const [adminNote, setAdminNote] = useState("");
  // Status pills should only "bump" in response to a real change, not on the
  // table's first paint — flips true after mount, matching the pattern used
  // on the inventory and admin distributors pages.
  const badgeMotionRef = useRef(false);
  useEffect(() => {
    badgeMotionRef.current = true;
  }, []);

  const {
    data: requests = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["supplier-requests"],
    queryFn: () => getSupplierRequests(),
  });

  const reviewMutation = useMutation({
    mutationFn: (input: {
      requestId: string;
      action: ReviewAction;
      approvedQty?: number;
      adminNote: string;
    }) =>
      reviewStockTransferRequest({
        data: {
          requestId: input.requestId,
          action: input.action,
          approvedQty: input.action === "approve" ? input.approvedQty : undefined,
          fulfilledByDistributorId: input.action === "approve" ? hubDistributorId : undefined,
          adminNote: input.adminNote || null,
        },
      }),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["supplier-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["distributor-overview"] });
      setReviewTarget(null);
      toast.success(variables.action === "approve" ? "Request approved" : "Request rejected");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not review request"),
  });

  function openReview(request: SupplierRequest, action: ReviewAction) {
    setApprovedQty(request.requestedQty);
    setAdminNote("");
    setReviewTarget({ request, action });
  }

  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 space-y-6 duration-300 ease-out fill-mode-both">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Requests could not load."}
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-lg font-semibold">Pending</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distributor</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>Requested at</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No pending requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map((request) => (
                    <TableRow key={request.id}>
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
                          <Button size="sm" variant="outline" onClick={() => openReview(request, "reject")}>
                            <X className="h-3.5 w-3.5" />
                            Reject
                          </Button>
                          <Button size="sm" onClick={() => openReview(request, "approve")}>
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
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-display text-lg font-semibold">History</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Distributor</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fulfilled by</TableHead>
                  <TableHead>Reviewed at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No reviewed requests yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.requestingDistributorName}</TableCell>
                      <TableCell>
                        <div className="font-medium">{request.productName}</div>
                        <div className="text-xs text-muted-foreground">{request.unitLabel}</div>
                      </TableCell>
                      <TableCell className="text-right">{request.requestedQty}</TableCell>
                      <TableCell className="text-right">{request.approvedQty ?? "—"}</TableCell>
                      <TableCell>
                        <span
                          key={request.status}
                          className={`${badgeMotionRef.current ? "animate-badge-bump " : ""}inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${REQUEST_STATUS_BADGE[request.status]}`}
                        >
                          {request.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.fulfilledByName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {request.reviewedAt ? format(new Date(request.reviewedAt), "MMM d, h:mm a") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </>
      )}

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
                adminNote,
              });
            }}
          >
            {reviewTarget?.action === "approve" && (
              <Field label="Quantity to send">
                <Input
                  type="number"
                  min={1}
                  value={approvedQty}
                  onChange={(event) => setApprovedQty(Number(event.target.value))}
                  required
                />
              </Field>
            )}
            <Field label="Note (optional)">
              <Input
                value={adminNote}
                onChange={(event) => setAdminNote(event.target.value)}
                maxLength={300}
                placeholder={
                  reviewTarget?.action === "approve"
                    ? "e.g. Sending partial quantity, rest next week"
                    : "e.g. Out of stock ourselves right now"
                }
              />
            </Field>
            <DialogFooter>
              <Button
                type="submit"
                disabled={
                  reviewMutation.isPending ||
                  (reviewTarget?.action === "approve" && (!approvedQty || approvedQty < 1))
                }
              >
                {reviewMutation.isPending && <Loader2 className="animate-spin" />}
                {reviewTarget?.action === "approve" ? "Approve request" : "Reject request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
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
