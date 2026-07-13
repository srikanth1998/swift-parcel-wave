import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  ShoppingCart,
  User,
  LogOut,
  Package,
  Search,
  ChevronDown,
  MapPin,
  Sparkles,
  Flame,
  Network,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { listCategories } from "@/lib/products.functions";
import { NotificationsBell } from "./notifications-bell";
import logoUrl from "@/assets/feabazaar-logo.png";

export function SiteHeader() {
  const { itemCount, subtotalCents, hydrated } = useCart();
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) return [];
      return data.map((row) => row.role);
    },
  });
  const isBackOffice = roles.includes("admin") || roles.includes("staff");

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    navigate({ to: "/shop", search: query ? { q: query } : {} });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 shadow-sm backdrop-blur">
      {/* Top row */}
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src={logoUrl} alt="FEABazaar" className="h-10 w-auto md:h-12" />
        </Link>

        {/* Search — desktop/tablet */}
        <form onSubmit={submitSearch} className="relative hidden flex-1 sm:block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for groceries, fruits, vegetables…"
            className="h-11 rounded-full border-border bg-muted/50 pl-11 pr-4 text-sm focus-visible:bg-background"
          />
        </form>

        <div className="ml-auto flex items-center gap-1">
          {user && <NotificationsBell userId={user.id} />}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hidden gap-2 md:inline-flex">
                  <User className="h-4 w-4" />
                  <span className="max-w-[110px] truncate">
                    {user.email?.split("@")[0] ?? "Account"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/orders">
                    <Package className="mr-2 h-4 w-4" />
                    My orders
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/referrals">
                    <Network className="mr-2 h-4 w-4" />
                    Referrals
                  </Link>
                </DropdownMenuItem>
                {isBackOffice && (
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Back office
                    </Link>
                  </DropdownMenuItem>
                )}
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
            <Button asChild variant="ghost" size="sm" className="hidden gap-2 md:inline-flex">
              <Link to="/auth">
                <User className="h-4 w-4" /> Sign in
              </Link>
            </Button>
          )}

          <Button
            asChild
            variant="default"
            size="sm"
            className="relative h-11 gap-2 rounded-full pl-4 pr-4"
          >
            <Link to="/cart" aria-label="Cart">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden text-sm font-semibold sm:inline">
                {hydrated && itemCount > 0
                  ? `${itemCount} item${itemCount === 1 ? "" : "s"}`
                  : "Cart"}
              </span>
              {hydrated && itemCount > 0 && (
                <span className="ml-1 hidden rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[11px] font-semibold sm:inline">
                  ₹{Math.round(subtotalCents / 100)}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>

      {/* Search — mobile-only row */}
      <form onSubmit={submitSearch} className="relative px-4 pb-3 sm:hidden">
        <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for groceries…"
          className="h-10 rounded-full border-border bg-muted/50 pl-10 pr-4 text-sm"
        />
      </form>

      {/* Category / nav row — desktop/tablet */}
      <div className="hidden border-t border-border bg-card md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="-mb-px flex items-center gap-1.5 border-b-2 border-primary px-3 py-2.5 text-sm font-semibold text-primary">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground text-[10px]">
                  ☰
                </span>
                Shop by Category
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {categories.length === 0 && (
                <DropdownMenuItem disabled>Loading categories…</DropdownMenuItem>
              )}
              {categories.map((c) => (
                <DropdownMenuItem key={c.id} asChild>
                  <Link to="/shop" search={{ category: c.slug }} className="cursor-pointer">
                    {c.name}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link
            to="/shop"
            className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary"
          >
            All Products
          </Link>
          <Link
            to="/shop"
            search={{ category: "fruits-vegetables" }}
            className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary"
          >
            Fruits & Vegetables
          </Link>
          <Link
            to="/shop"
            search={{ category: "dairy-eggs" }}
            className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary"
          >
            Dairy & Eggs
          </Link>
          <Link
            to="/shop"
            search={{ category: "pantry" }}
            className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary"
          >
            Rice & Grains
          </Link>
          <Link
            to="/shop"
            search={{ category: "beverages" }}
            className="px-3 py-2.5 text-sm font-medium text-foreground hover:text-primary"
          >
            Beverages
          </Link>
          <span className="ml-auto flex items-center gap-4 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Free delivery over ₹499
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-accent" /> Fresh from our warehouse
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> India
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
