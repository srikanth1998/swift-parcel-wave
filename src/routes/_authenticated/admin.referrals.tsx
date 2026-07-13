import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CheckCircle2,
  Download,
  Eye,
  Network,
  Search,
  SlidersHorizontal,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import {
  getAdminReferralManagement,
  updateReferralCommissionStatus,
} from "@/lib/referrals.functions";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminPageFrame } from "@/components/admin-nav";
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

type StatusFilter = "all" | "pending" | "approved" | "paid" | "cancelled";
type ReferralLevelFilter = "all" | "1" | "2";
type AdminFilters = {
  search: string;
  status: StatusFilter;
  referralLevel: ReferralLevelFilter;
  dateFrom: string;
  dateTo: string;
};

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: "All",
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<Exclude<StatusFilter, "all">, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({ meta: [{ title: "Referral Management - FEABazaar" }] }),
  component: AdminReferralPage,
});

function AdminReferralPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AdminFilters>({
    search: "",
    status: "all",
    referralLevel: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const serverFilters = useMemo(
    () => ({
      ...filters,
      dateFrom: filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : "",
      dateTo: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : "",
    }),
    [filters],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-referrals", serverFilters],
    queryFn: () => getAdminReferralManagement({ data: serverFilters }),
  });

  const selectedId = selectedUserId ?? data?.users[0]?.id ?? null;
  const selectedProfile = data?.profiles.find((profile) => profile.id === selectedId);
  const directChildren = selectedId
    ? (data?.profiles.filter((profile) => profile.referredByUserId === selectedId) ?? [])
    : [];
  const secondLevelChildren = directChildren.flatMap(
    (child) => data?.profiles.filter((profile) => profile.referredByUserId === child.id) ?? [],
  );

  const updateStatusMutation = useMutation({
    mutationFn: (input: { id: string; status: "approved" | "paid" | "cancelled" }) =>
      updateReferralCommissionStatus({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast.success("Commission updated");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update commission");
    },
  });

  const exportCsv = () => {
    if (!data?.commissions.length) return;
    const headers = [
      "Date",
      "Buyer",
      "Beneficiary",
      "Order Number",
      "Order Amount",
      "Referral Level",
      "Percentage",
      "Commission",
      "Status",
    ];
    const rows = data.commissions.map((commission) => [
      format(new Date(commission.date), "yyyy-MM-dd HH:mm"),
      commission.buyerName,
      commission.beneficiaryName,
      commission.orderNumber,
      (commission.orderAmountCents / 100).toFixed(2),
      `L${commission.referralLevel}`,
      `${commission.percentage}%`,
      (commission.commissionCents / 100).toFixed(2),
      commission.status,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "referral-commissions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <AdminPageFrame
        title="Referral Management"
        description="Review users, referral hierarchy, and commission payout states."
      >
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Referral management could not load."}
        </div>
      </AdminPageFrame>
    );
  }

  return (
    <AdminPageFrame
      title="Referral Management"
      description="Review users, referral hierarchy, and commission payout states."
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" onClick={exportCsv} disabled={!data?.commissions.length}>
            <Download />
            Export CSV
          </Button>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminStat
            icon={WalletCards}
            label="Pending commissions"
            value={data?.stats.pendingCount ?? 0}
          />
          <AdminStat
            icon={SlidersHorizontal}
            label="Pending amount"
            value={formatCents(data?.stats.pendingCents ?? 0)}
          />
          <AdminStat
            icon={CheckCircle2}
            label="Approved"
            value={formatCents(data?.stats.approvedCents ?? 0)}
          />
          <AdminStat icon={Users} label="Paid" value={formatCents(data?.stats.paidCents ?? 0)} />
        </section>

        <section className="rounded-md border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_150px_150px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filters.search}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, search: event.target.value }))
                }
                className="pl-9"
                placeholder="Search users or codes"
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(status) =>
                setFilters((current) => ({ ...current, status: status as StatusFilter }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["all", "pending", "approved", "paid", "cancelled"] as StatusFilter[]).map(
                  (status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <Select
              value={filters.referralLevel}
              onValueChange={(referralLevel) =>
                setFilters((current) => ({
                  ...current,
                  referralLevel: referralLevel as ReferralLevelFilter,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="1">Level 1</SelectItem>
                <SelectItem value="2">Level 2</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateFrom: event.target.value }))
              }
            />
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                setFilters((current) => ({ ...current, dateTo: event.target.value }))
              }
            />
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Users</h2>
            </div>
            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead className="text-right">Direct</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : data?.users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.users.map((user) => (
                      <TableRow
                        key={user.id}
                        data-state={selectedId === user.id ? "selected" : undefined}
                      >
                        <TableCell>
                          <div className="font-medium">{user.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="rounded bg-secondary px-2 py-1 text-xs">
                            {user.referralCode}
                          </code>
                        </TableCell>
                        <TableCell className="text-right">{user.directReferralCount}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedUserId(user.id)}
                          >
                            <Eye />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Referral Hierarchy</h2>
            </div>
            {selectedProfile ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <div className="font-medium">{selectedProfile.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedProfile.referralCode}
                  </div>
                </div>
                <div className="space-y-2 border-l border-border pl-4">
                  {directChildren.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
                      No direct referrals.
                    </div>
                  ) : (
                    directChildren.map((child) => (
                      <div key={child.id}>
                        <div className="flex items-center gap-2 rounded-md bg-secondary/70 px-3 py-2">
                          <span className="font-medium">{child.fullName}</span>
                          <Badge variant="outline" className="ml-auto">
                            L1
                          </Badge>
                        </div>
                        <div className="ml-5 mt-1 space-y-1 border-l border-border pl-4">
                          {data?.profiles
                            .filter((profile) => profile.referredByUserId === child.id)
                            .map((grandchild) => (
                              <div
                                key={grandchild.id}
                                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground"
                              >
                                <span>{grandchild.fullName}</span>
                                <Badge variant="outline" className="ml-auto">
                                  L2
                                </Badge>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Level 1 referrals</div>
                    <div className="mt-1 text-2xl font-semibold">{directChildren.length}</div>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="text-xs text-muted-foreground">Level 2 referrals</div>
                    <div className="mt-1 text-2xl font-semibold">{secondLevelChildren.length}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                Select a user to view hierarchy.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Commission History</h2>
            <div className="text-sm text-muted-foreground">
              {data?.commissions.length ?? 0} records
            </div>
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Beneficiary</TableHead>
                  <TableHead>Order Number</TableHead>
                  <TableHead className="text-right">Order Amount</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : data?.commissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      No commissions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(commission.date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>{commission.buyerName}</TableCell>
                      <TableCell>
                        <div className="font-medium">{commission.beneficiaryName}</div>
                        <div className="text-xs text-muted-foreground">
                          {commission.beneficiaryCode}
                        </div>
                      </TableCell>
                      <TableCell>{commission.orderNumber}</TableCell>
                      <TableCell className="text-right">
                        {formatCents(commission.orderAmountCents)}
                      </TableCell>
                      <TableCell>L{commission.referralLevel}</TableCell>
                      <TableCell>{commission.percentage}%</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCents(commission.commissionCents)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                            STATUS_CLASS[commission.status]
                          }`}
                        >
                          {STATUS_LABEL[commission.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {commission.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: commission.id,
                                  status: "approved",
                                })
                              }
                            >
                              <CheckCircle2 />
                              Approve
                            </Button>
                          )}
                          {(commission.status === "pending" ||
                            commission.status === "approved") && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() =>
                                updateStatusMutation.mutate({ id: commission.id, status: "paid" })
                              }
                            >
                              <WalletCards />
                              Paid
                            </Button>
                          )}
                          {commission.status !== "cancelled" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updateStatusMutation.isPending}
                              onClick={() =>
                                updateStatusMutation.mutate({
                                  id: commission.id,
                                  status: "cancelled",
                                })
                              }
                            >
                              <XCircle />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AdminPageFrame>
  );
}

function AdminStat({
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

function csvValue(value: string | number) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
