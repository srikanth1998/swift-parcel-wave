import type { ComponentType } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Store, ShoppingCart, User, Package } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function TabContent({
  active,
  label,
  Icon,
  badge,
}: {
  active: boolean;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
}) {
  return (
    <>
      <span
        className={cn(
          "relative flex h-6 w-6 items-center justify-center transition-transform duration-200",
          active ? "-translate-y-0.5 text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
        {!!badge && badge > 0 && (
          <span
            key={badge}
            className="absolute -right-2 -top-1.5 flex h-4 min-w-4 animate-badge-bump items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-foreground"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-[11px] font-medium transition-colors duration-200",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      {active && (
        <span
          key={label}
          className="absolute inset-x-6 top-0 h-0.5 animate-in fade-in rounded-full bg-primary duration-200"
        />
      )}
    </>
  );
}

export function MobileBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { itemCount, hydrated } = useCart();
  const { user } = useAuthUser();

  const items: Array<{
    to: "/" | "/shop" | "/cart" | "/orders" | "/auth" | "/profile";
    label: string;
    icon: typeof Home;
    badge?: number;
    active: boolean;
  }> = [
    { to: "/", label: "Home", icon: Home, active: pathname === "/" },
    {
      to: "/shop",
      label: "Shop",
      icon: Store,
      active: pathname.startsWith("/shop") || pathname.startsWith("/product"),
    },
    {
      to: "/cart",
      label: "Cart",
      icon: ShoppingCart,
      badge: hydrated ? itemCount : 0,
      active: pathname.startsWith("/cart") || pathname.startsWith("/checkout"),
    },
    {
      to: user ? "/orders" : "/auth",
      label: user ? "Orders" : "Sign in",
      icon: Package,
      active: user ? pathname.startsWith("/orders") : pathname.startsWith("/auth"),
    },
    ...(user
      ? [
          {
            to: "/profile" as const,
            label: "Account",
            icon: User,
            active: pathname.startsWith("/profile"),
          },
        ]
      : []),
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, badge, active }) => (
          <li key={label} className="flex flex-1">
            <Link
              to={to}
              className="relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 outline-none focus-visible:bg-muted"
              aria-label={label}
            >
              <TabContent active={active} label={label} Icon={Icon} badge={badge} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
