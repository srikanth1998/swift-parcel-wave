import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, Network, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";

export function MobileBottomNav() {
  const { itemCount, hydrated } = useCart();
  const { user } = useAuthUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
    { to: "/shop", label: "Shop", icon: LayoutGrid, match: (p: string) => p.startsWith("/shop") || p.startsWith("/product") },
    { to: "/cart", label: "Cart", icon: ShoppingCart, match: (p: string) => p.startsWith("/cart") },
    {
      to: user ? "/orders" : "/auth",
      label: user ? "Orders" : "Account",
      icon: User,
      match: (p: string) => p.startsWith("/orders") || p.startsWith("/auth"),
    },
    ...(user
      ? [
          {
            to: "/referrals",
            label: "Refer",
            icon: Network,
            match: (p: string) => p.startsWith("/referrals"),
          },
        ]
      : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <ul className={`mx-auto grid max-w-md ${items.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {items.map((it) => {
          const active = it.match(pathname);
          const Icon = it.icon;
          const showBadge = it.to === "/cart" && hydrated && itemCount > 0;
          return (
            <li key={it.label}>
              <Link
                to={it.to}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{it.label}</span>
                {showBadge && (
                  <span className="absolute right-[calc(50%-22px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                    {itemCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
