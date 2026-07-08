import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCategories, listProducts } from "@/lib/products.functions";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Leaf, Package, Truck } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Home,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: ["categories"],
        queryFn: () => listCategories(),
      }),
      context.queryClient.ensureQueryData({
        queryKey: ["products", { featured: true }],
        queryFn: () => listProducts({ data: { featuredOnly: true, limit: 8 } }),
      }),
    ]);
  },
});

function Home() {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const { data: featured = [] } = useQuery({
    queryKey: ["products", { featured: true }],
    queryFn: () => listProducts({ data: { featuredOnly: true, limit: 8 } }),
  });

  return (
    <div>
      <section className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Leaf className="h-3.5 w-3.5" /> Fresh from our warehouse
            </div>
            <h1 className="font-display text-4xl font-bold leading-tight text-foreground md:text-6xl">
              Groceries, picked & packed with care.
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground md:text-lg">
              Shop fresh produce, dairy, pantry staples and more. We handle picking, packing,
              and hand-off to delivery — so your order arrives ready to enjoy.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/shop">
                  Shop groceries <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <img
              src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=900"
              alt="Fresh groceries basket"
              className="rounded-3xl object-cover shadow-lg"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Leaf, title: "Handpicked fresh", body: "Every item selected from our warehouse shelves." },
            { icon: Package, title: "Packed with care", body: "Fragile items cushioned, cold items insulated." },
            { icon: Truck, title: "Sent for delivery", body: "Handed to our delivery partner the same day." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">Shop by category</h2>
          <Link to="/shop" className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              to="/shop"
              search={{ category: c.slug }}
              className="group rounded-2xl border border-border bg-card p-4 text-center transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="text-sm font-medium text-foreground group-hover:text-primary">
                {c.name}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-2xl font-semibold md:text-3xl">Featured picks</h2>
          <Link to="/shop" className="text-sm font-medium text-primary hover:underline">
            See all products
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
