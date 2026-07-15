import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BadgeIndianRupee,
  ChevronDown,
  ChevronRight,
  Copy,
  Network,
  Share2,
  ShoppingBag,
  Users,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { getReferralDashboard } from "@/lib/referrals.functions";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StatusFilter = "all" | "pending" | "approved" | "paid" | "cancelled";

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

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals - FEABazaar" }] }),
  component: ReferralDashboard,
});

function ReferralDashboard() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data, isLoading } = useQuery({
    queryKey: ["referral-dashboard"],
    queryFn: () => getReferralDashboard(),
  });

  const referralLink = useMemo(() => {
    if (!data?.profile.referral_code) return "";
    const origin = typeof window === "undefined" ? "https://mywebsite.com" : window.location.origin;
    return `${origin}/signup?ref=${data.profile.referral_code}`;
  }, [data?.profile.referral_code]);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    if (statusFilter === "all") return data.history;
    return data.history.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const earningsBars = data
    ? [
        { label: "Pending", value: data.stats.pendingEarningsCents, className: "bg-amber-500" },
        { label: "Approved", value: data.stats.approvedEarningsCents, className: "bg-blue-500" },
        { label: "Paid", value: data.stats.paidEarningsCents, className: "bg-emerald-500" },
      ]
    : [];
  const maxEarnings = Math.max(...earningsBars.map((bar) => bar.value), 1);

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const shareReferral = async () => {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "FEABazaar referral",
        text: "Use my FEABazaar referral code.",
        url: referralLink,
      });
      return;
    }
    await copyValue(referralLink);
  };

  if (isLoading || !data) {
    return (
      <div className="bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />

          <section className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <Skeleton className="h-72 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Referral Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your two-level referral network and commission history.
            </p>
          </div>
        </div>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Referral Code
                </div>
                <div className="mt-2 font-display text-3xl font-semibold tracking-normal">
                  {data.profile.referral_code}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  title="Copy code"
                  onClick={() => copyValue(data.profile.referral_code)}
                >
                  <Copy />
                </Button>
                <Button size="icon" variant="outline" title="Share link" onClick={shareReferral}>
                  <Share2 />
                </Button>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-border bg-background p-3">
              <div className="text-xs font-medium text-muted-foreground">Referral Link</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded bg-secondary px-3 py-2 text-xs">
                  {referralLink}
                </code>
                <Button variant="secondary" onClick={() => copyValue(referralLink)}>
                  <Copy />
                  Copy
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 font-semibold">
              <WalletCards className="h-5 w-5 text-primary" />
              Earnings
            </div>
            <div className="mt-4 text-3xl font-semibold">
              {formatCents(data.stats.lifetimeEarningsCents)}
            </div>
            <div className="mt-4 space-y-3">
              {earningsBars.map((bar) => (
                <div key={bar.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted-foreground">{bar.label}</span>
                    <span className="font-medium">{formatCents(bar.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${bar.className}`}
                      style={{ width: `${Math.max(6, (bar.value / maxEarnings) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal index={0}>
            <StatCard icon={Users} label="Total referrals" value={data.stats.totalReferrals} />
          </Reveal>
          <Reveal index={1}>
            <StatCard icon={Network} label="Active referrals" value={data.stats.activeReferrals} />
          </Reveal>
          <Reveal index={2}>
            <StatCard
              icon={ShoppingBag}
              label="Orders generated"
              value={data.stats.ordersGenerated}
            />
          </Reveal>
          <Reveal index={3}>
            <StatCard
              icon={BadgeIndianRupee}
              label="Paid earnings"
              value={formatCents(data.stats.paidEarningsCents)}
            />
          </Reveal>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">Referral Tree</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Two levels are shown by default.
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 font-medium">
                You
              </div>
              {data.tree.length === 0 ? (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No referrals yet.
                </div>
              ) : (
                <div className="space-y-2 border-l border-border pl-4">
                  {data.tree.map((direct, i) => {
                    const isOpen = expanded[direct.id] ?? true;
                    return (
                      <Reveal key={direct.id} index={i}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-secondary"
                          onClick={() =>
                            setExpanded((current) => ({ ...current, [direct.id]: !isOpen }))
                          }
                        >
                          {direct.children.length > 0 ? (
                            isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )
                          ) : (
                            <span className="w-4" />
                          )}
                          <span className="font-medium">
                            {direct.full_name || direct.referral_code}
                          </span>
                          <Badge variant="outline" className="ml-auto">
                            L1
                          </Badge>
                        </button>
                        {isOpen && direct.children.length > 0 && (
                          <div className="ml-6 space-y-1 border-l border-border pl-4">
                            {direct.children.map((child) => (
                              <div
                                key={child.id}
                                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground"
                              >
                                <span>{child.full_name || child.referral_code}</span>
                                <Badge variant="outline" className="ml-auto">
                                  L2
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </Reveal>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold">Commission History</h2>
              <div className="flex flex-wrap gap-2">
                {(["all", "pending", "approved", "paid", "cancelled"] as StatusFilter[]).map(
                  (status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={statusFilter === status ? "default" : "outline"}
                      onClick={() => setStatusFilter(status)}
                    >
                      {STATUS_LABEL[status]}
                    </Button>
                  ),
                )}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead>Order Number</TableHead>
                    <TableHead className="text-right">Order Amount</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both">
                          No commissions found.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(item.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>{item.buyerName}</TableCell>
                        <TableCell>
                          <div className="font-medium">{item.orderNumber}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(item.orderAmountCents)}
                        </TableCell>
                        <TableCell>L{item.referralLevel}</TableCell>
                        <TableCell>{item.percentage}%</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCents(item.commissionCents)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${
                              STATUS_CLASS[item.status]
                            }`}
                          >
                            {STATUS_LABEL[item.status]}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}
