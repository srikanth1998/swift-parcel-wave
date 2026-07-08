import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useState } from "react";
import { listCategories, listProducts } from "@/lib/products.functions";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const shopSearchSchema = z.object({
  category: z.string().optional(),
});

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
        queryFn: () =>
          listProducts({ data: deps.category ? { categorySlug: deps.category } : {} }),
      }),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Shop groceries — FEA Bazar" },
      { name: "description", content: "Browse fresh produce, dairy, pantry staples and more." },
    ],
  }),
  component: Shop,
});

function Shop() {
  const { category } = Route.useSearch();
  const [search, setSearch] = useState("");
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", { category: category ?? null }],
    queryFn: () => listProducts({ data: category ? { categorySlug: category } : {} }),
  });

  const filtered = search
    ? products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : products;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-semibold">Shop</h1>
      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/shop"
            className={`rounded-full border px-3 py-1 text-sm ${!category ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}
          >
            All
          </Link>
          {categories.map((c) => (
            <Link
              key={c.id}
              to="/shop"
              search={{ category: c.slug }}
              className={`rounded-full border px-3 py-1 text-sm ${category === c.slug ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}
            >
              {c.name}
            </Link>
          ))}
        </div>
        <div className="relative w-full md:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {filtered.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="mt-16 text-center text-muted-foreground">No products match your search.</div>
      )}
    </div>
  );
}
