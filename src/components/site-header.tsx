import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, User, LogOut, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCart } from "@/hooks/use-cart";
import { useAuthUser } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { NotificationsBell } from "./notifications-bell";

export function SiteHeader() {
  const { itemCount, hydrated } = useCart();
  const { user } = useAuthUser();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground font-display text-lg font-bold">
            F
          </span>
          <span className="font-display text-xl font-semibold text-foreground">FEA Bazar</span>
        </Link>
        <nav className="hidden gap-6 md:flex">
          <Link to="/" className="text-sm font-medium text-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>
            Home
          </Link>
          <Link to="/shop" className="text-sm font-medium text-foreground hover:text-primary" activeProps={{ className: "text-primary" }}>
            Shop
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          {user && <NotificationsBell userId={user.id} />}
          <Button asChild variant="ghost" size="icon" className="relative" aria-label="Cart">
            <Link to="/cart">
              <ShoppingCart className="h-5 w-5" />
              {hydrated && itemCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground">
                  {itemCount}
                </span>
              )}
            </Link>
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/orders">
                    <Package className="mr-2 h-4 w-4" />
                    My orders
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
