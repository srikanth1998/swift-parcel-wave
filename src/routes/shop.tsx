import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemo, useState } from "react";
import { listCategories, listProducts } from "@/lib/products.functions";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, SlidersHorizontal, ChevronRight, X } from "lucide-react";
import { deriveOffer } from "@/lib/format";

const shopSearchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
});

type SortMode = "popular" | "price-asc" | "price-desc" | "discount";

export const Route = createFileRoute("/shop")({
  validateSearch: shopSearchSchema,
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["categories"],
        queryFn: () => listCategories(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { category: deps.category ?? null }],
        queryFn: () => listProducts({ data: deps.category ? { categorySlug: deps.category } : {} }),
      }),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Shop groceries — FEABazaar" },
      { name: "description", content: "Browse fresh produce, dairy, pantry staples and more." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const { category, q } = Route.useSearch();
  const [localSearch, setLocalSearch] = useState(q ?? "");
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);
  const [sort, setSort] = useState<SortMode>("popular");

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", { category: category ?? null }],
    queryFn: () => listProducts({ data: category ? { categorySlug: category } : {} }),
  });

  const activeCategory = categories.find((c) => c.slug === category);
  const query = (localSearch || q || "").trim().toLowerCase();

  const filtered = useMemo(() => {
    let list = products;
    if (query) list = list.filter((p) => p.name.toLowerCase().includes(query));
    if (priceMax) list = list.filter((p) => p.price_cents <= priceMax);
    if (onlyDiscounted) list = list.filter((p) => deriveOffer(p.slug, p.price_cents) !== null);
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price_cents - b.price_cents);
    if (sort === "price-desc") sorted.sort((a, b) => b.price_cents - a.price_cents);
    if (sort === "discount") {
      sorted.sort(
        (a, b) =>
          (deriveOffer(b.slug, b.price_cents)?.discountPct ?? 0) -
          (deriveOffer(a.slug, a.price_cents)?.discountPct ?? 0),
      );
    }
    return sorted;
  }, [products, query, priceMax, onlyDiscounted, sort]);

  const filters = (
    <FilterPanel
      categories={categories}
      activeCategory={category}
      priceMax={priceMax}
      setPriceMax={setPriceMax}
      onlyDiscounted={onlyDiscounted}
      setOnlyDiscounted={setOnlyDiscounted}
    />
  );

  return (
    <div className="bg-muted/30">
      {/* Breadcrumb + heading */}
      <div className="mx-auto max-w-7xl px-4 pt-6">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/shop" className="hover:text-primary">
            Shop
          </Link>
          {activeCategory && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="font-medium text-foreground">{activeCategory.name}</span>
            </>
          )}
        </nav>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              {activeCategory ? activeCategory.name : "All Products"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {filtered.length} product{filtered.length === 1 ? "" : "s"} available
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search in results…"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="h-9 rounded-full bg-card pl-9 text-sm"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="h-9 rounded-full border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="popular">Popular</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="discount">Biggest discount</option>
            </select>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-full lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">{filters}</div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 rounded-2xl border border-border bg-card p-4">
            {filters}
          </div>
        </aside>

        <div>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card py-20 text-center">
              <div className="text-4xl">🧺</div>
              <div className="mt-2 font-display text-lg font-semibold">No products match</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Try clearing filters or searching differently.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setLocalSearch("");
                  setPriceMax(null);
                  setOnlyDiscounted(false);
                }}
              >
                <X className="mr-1 h-4 w-4" /> Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPanel({
  categories,
  activeCategory,
  priceMax,
  setPriceMax,
  onlyDiscounted,
  setOnlyDiscounted,
}: {
  categories: { id: string; slug: string; name: string }[];
  activeCategory?: string;
  priceMax: number | null;
  setPriceMax: (n: number | null) => void;
  onlyDiscounted: boolean;
  setOnlyDiscounted: (b: boolean) => void;
}) {
  return (
    <div className="space-y-5 text-sm">
      <FilterGroup title="Category">
        <ul className="space-y-1">
          <li>
            <Link
              to="/shop"
              className={`block rounded-md px-2 py-1.5 transition-colors ${!activeCategory ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
            >
              All products
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <Link
                to="/shop"
                search={{ category: c.slug }}
                className={`block rounded-md px-2 py-1.5 transition-colors ${activeCategory === c.slug ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`}
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </FilterGroup>

      <FilterGroup title="Price">
        <div className="space-y-1.5">
          {[
            { label: "Under ₹100", value: 10000 },
            { label: "Under ₹250", value: 25000 },
            { label: "Under ₹500", value: 50000 },
            { label: "Under ₹1,000", value: 100000 },
          ].map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
            >
              <Checkbox
                checked={priceMax === opt.value}
                onCheckedChange={(v) => setPriceMax(v ? opt.value : null)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Offers">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted">
          <Checkbox checked={onlyDiscounted} onCheckedChange={(v) => setOnlyDiscounted(!!v)} />
          <span>Discounted items only</span>
        </label>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}
