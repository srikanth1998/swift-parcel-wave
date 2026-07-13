import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminPageFrame } from "@/components/admin-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminCustomers, updateAdminUserRoles } from "@/lib/admin.functions";
import { formatCents } from "@/lib/format";

type Role = "customer" | "staff" | "admin";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({ meta: [{ title: "Customers - FEABazaar" }] }),
  component: AdminCustomersPage,
});

function AdminCustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const filters = useMemo(() => ({ search }), [search]);

  const { data: customers = [], isLoading, error } = useQuery({
    queryKey: ["admin-customers", filters],
    queryFn: () => getAdminCustomers({ data: filters }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-customers-profiles")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; roles: Role[] }) =>
      updateAdminUserRoles({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
      toast.success("Roles updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Role update failed"),
  });

  const toggleRole = (userId: string, roles: Role[], role: "staff" | "admin") => {
    const next = roles.includes(role)
      ? roles.filter((item) => item !== role)
      : [...roles, role];
    roleMutation.mutate({ userId, roles: [...new Set<Role>(["customer", ...next])] });
  };

  return (
    <AdminPageFrame title="Customers" description="Review customer activity and manage staff/admin access.">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Customers could not load."}
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-md border border-border bg-card p-4 shadow-sm">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Search name, email, phone, or referral code"
              />
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Referral Code</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <div className="font-medium">{customer.fullName}</div>
                        <div className="text-xs text-muted-foreground">{customer.email ?? "No email"}</div>
                        <div className="text-xs text-muted-foreground">{customer.phone ?? "No phone"}</div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-secondary px-2 py-1 text-xs">{customer.referralCode}</code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {customer.roles.map((role) => (
                            <span
                              key={role}
                              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                                role === "admin"
                                  ? "border-purple-200 bg-purple-50 text-purple-700"
                                  : role === "staff"
                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                    : "border-gray-200 bg-gray-50 text-gray-700"
                              }`}
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{customer.orderCount}</TableCell>
                      <TableCell className="text-right font-medium">{formatCents(customer.spendCents)}</TableCell>
                      <TableCell>{format(new Date(customer.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant={customer.roles.includes("staff") ? "secondary" : "outline"}
                            disabled={roleMutation.isPending}
                            onClick={() => toggleRole(customer.id, customer.roles as Role[], "staff")}
                          >
                            <UserCog />
                            Staff
                          </Button>
                          <Button
                            size="sm"
                            variant={customer.roles.includes("admin") ? "secondary" : "outline"}
                            disabled={roleMutation.isPending}
                            onClick={() => toggleRole(customer.id, customer.roles as Role[], "admin")}
                          >
                            <ShieldCheck />
                            Admin
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/admin/referrals">Referrals</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </AdminPageFrame>
  );
}
