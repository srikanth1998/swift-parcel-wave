import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LayoutDashboard, PackageCheck, Warehouse } from "lucide-react";
import type { ReactNode } from "react";
import { getDistributorOverview } from "@/lib/distributors.functions";

const items = [
  { to: "/distributor", label: "Dashboard", icon: LayoutDashboard },
  { to: "/distributor/orders", label: "Orders", icon: PackageCheck },
  { to: "/distributor/inventory", label: "Inventory", icon: Warehouse },
] as const;

const REQUESTS_HREF = "/distributor/requests";

export function DistributorNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Same query key as the dashboard page's getDistributorOverview() call, so
  // the two share a single cached fetch instead of doubling up.
  const { data } = useQuery({
    queryKey: ["distributor-overview"],
    queryFn: () => getDistributorOverview(),
  });
  const canSupply = data?.distributor?.can_supply ?? false;

  return (
    <aside className="border-b border-border bg-card xl:min-h-[calc(100vh-9rem)] xl:border-b-0 xl:border-r">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 xl:sticky xl:top-28 xl:block xl:w-56 xl:space-y-1 xl:px-3">
        {items.map((item) => {
          const active =
            item.to === "/distributor" ? pathname === "/distributor" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {canSupply && (
          <Link
            to={REQUESTS_HREF}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              pathname.startsWith(REQUESTS_HREF)
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Requests
          </Link>
        )}
      </div>
    </aside>
  );
}

export function DistributorPageFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/30">
      <div className="xl:grid xl:grid-cols-[auto_1fr]">
        <DistributorNav />
        <div className="min-w-0">
          <div className="mx-auto max-w-7xl px-4 py-8">
            <div>
              <h1 className="font-display text-3xl font-semibold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
