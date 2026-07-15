import { Link } from "@tanstack/react-router";
import { Home, Store, ShoppingCart, User, Package } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";

export function MobileBottomNav() {
  const { itemCount, hydrated } = useCart();
  const { user } = useAuthUser();

  const items: Array<{
    to: "/" | "/shop" | "/cart" | "/orders" | "/auth" | "/profile";
    label: string;
    icon: typeof Home;
    badge?: number;
  }> = [
    { to: "/", label: "Home", icon: Home },
    { to: "/shop", label: "Shop", icon: Store },
    { to: "/cart", label: "Cart", icon: ShoppingCart, badge: hydrated ? itemCount : 0 },
    { to: user ? "/orders" : "/auth", label: user ? "Orders" : "Sign in", icon: Package },
    ...(user
      ? [{ to: "/profile" as const, label: "Account", icon: User }]
      : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <li key={label} className="flex-1">
            <Link
              to={to}
              className="relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground [&.active]:text-primary"
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
              {badge && badge > 0 ? (
                <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {badge}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
