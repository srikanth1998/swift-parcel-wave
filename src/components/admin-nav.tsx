import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  LayoutDashboard,
  Network,
  PackageCheck,
  Settings,
  Table2,
  TicketPercent,
  Truck,
  UsersRound,
  Warehouse,
} from "lucide-react";
import type { ReactNode } from "react";

const items = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: PackageCheck },
  { to: "/admin/products", label: "Catalog", icon: Boxes },
  { to: "/admin/products-board", label: "Products Board", icon: Table2 },
  { to: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { to: "/admin/distributors", label: "Distributors", icon: Truck },
  { to: "/admin/coupons", label: "Coupons", icon: TicketPercent },
  { to: "/admin/customers", label: "Customers", icon: UsersRound },
  { to: "/admin/referrals", label: "Referrals", icon: Network },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside className="border-b border-border bg-card xl:min-h-[calc(100vh-9rem)] xl:border-b-0 xl:border-r">
      <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 xl:sticky xl:top-28 xl:block xl:w-56 xl:space-y-1 xl:px-3">
        {items.map((item) => {
          const active =
            item.to === "/admin"
              ? pathname === "/admin"
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
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
      </div>
    </aside>
  );
}

export function AdminPageFrame({
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
        <AdminNav />
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
