import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCategories, listProducts } from "@/lib/products.functions";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Leaf, ShoppingBasket, Truck, Percent, Sparkles } from "lucide-react";

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
      context.queryClient.ensureQueryData({
        queryKey: ["products", { all: true }],
        queryFn: () => listProducts({ data: { limit: 12 } }),
      }),
    ]);
  },
});

const CATEGORY_IMAGES: Record<string, string> = {
  "fruits-vegetables": "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400",
  "dairy-eggs": "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400",
  "bakery": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400",
  "meat-seafood": "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400",
  "pantry": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400",
  "beverages": "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400",
  "snacks": "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400",
  "spices": "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400",
  "frozen": "https://images.unsplash.com/photo-1627308594190-a057cd4bfac8?w=400",
  "household": "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=400",
  "personal-care": "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=400",
};

function categoryImage(slug: string) {
  return CATEGORY_IMAGES[slug] ?? "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400";
}

function Home() {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
  });
  const { data: featured = [] } = useQuery({
    queryKey: ["products", { featured: true }],
    queryFn: () => listProducts({ data: { featuredOnly: true, limit: 8 } }),
  });
  const { data: allProducts = [] } = useQuery({
    queryKey: ["products", { all: true }],
    queryFn: () => listProducts({ data: { limit: 12 } }),
  });

  const bestSellers = featured.length ? featured : allProducts.slice(0, 8);
  const dailyStaples = allProducts.slice(0, 6);

  return (
    <div className="bg-muted/30">
      {/* Hero banner */}
      <section className="mx-auto max-w-7xl px-4 pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-lg">
          <div className="absolute inset-0 opacity-25">
            <img
              src="https://images.unsplash.com/photo-1506617564039-2f3b650b7010?w=1400"
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="relative grid gap-6 px-6 py-10 sm:px-10 md:grid-cols-[1.2fr_1fr] md:items-center md:py-14">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Fresh Deals · Every Day
              </div>
              <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
                Fresh Groceries<br />Delivered to Your Door
              </h1>
              <p className="mt-3 max-w-md text-sm text-primary-foreground/85 sm:text-base">
                Shop fresh. Save more. Daily essentials from FEABazaar's warehouse —
                handpicked, carefully packed, and sent out fast.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild size="lg" variant="secondary" className="rounded-full font-semibold">
                  <Link to="/shop">
                    Shop Now <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="rounded-full text-primary-foreground hover:bg-primary-foreground/10">
                  <Link to="/shop" search={{ category: "fruits-vegetables" }}>
                    Fresh Fruits & Veggies
                  </Link>
                </Button>
              </div>
            </div>
            <div className="hidden md:block">
              <img
                src="https://images.unsplash.com/photo-1543168256-418811576931?w=700"
                alt="Fresh vegetables and fruits"
                className="mx-auto max-h-72 rounded-2xl object-cover shadow-2xl ring-4 ring-primary-foreground/10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Offer tiles */}
      <section className="mx-auto max-w-7xl px-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { badge: "Up to 30% Off", title: "Deals of the Week", body: "Groceries you love, cheaper", bg: "from-amber-100 to-amber-50", accent: "text-amber-700", img: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=200" },
            { badge: "Best Value", title: "Big Pack Savings", body: "Buy more, save more", bg: "from-emerald-100 to-emerald-50", accent: "text-emerald-700", img: "https://images.unsplash.com/photo-1573246123716-6b1782bfc499?w=200" },
            { badge: "Today's Special", title: "Fresh Fruits & Vegetables", body: "Farm-fresh, everyday", bg: "from-rose-100 to-rose-50", accent: "text-rose-700", img: "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=200" },
            { badge: "Limited Time", title: "Household Essentials", body: "Stock up your home", bg: "from-sky-100 to-sky-50", accent: "text-sky-700", img: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=200" },
          ].map((t) => (
            <Link
              key={t.title}
              to="/shop"
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.bg} p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md`}
            >
              <div className={`inline-block rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase ${t.accent}`}>
                {t.badge}
              </div>
              <div className="mt-3 max-w-[65%]">
                <div className="font-display text-base font-bold text-foreground">{t.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.body}</div>
              </div>
              <img src={t.img} alt="" className="pointer-events-none absolute -right-2 bottom-0 h-20 w-20 rounded-full object-cover ring-4 ring-white/70" />
            </Link>
          ))}
        </div>
      </section>

      {/* Shop by category */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <SectionHeading title="Shop by Category" subtitle="Everything you need — organised and easy to browse" href="/shop" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              to="/shop"
              search={{ category: c.slug }}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="relative">
                <div className="h-16 w-16 overflow-hidden rounded-full bg-muted ring-2 ring-primary/10 sm:h-20 sm:w-20">
                  <img src={categoryImage(c.slug)} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-foreground shadow">
                  Save
                </span>
              </div>
              <div className="line-clamp-2 text-xs font-medium text-foreground group-hover:text-primary sm:text-sm">
                {c.name}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Best sellers */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <SectionHeading title="Best Sellers" subtitle="What customers are stocking up on this week" href="/shop" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {bestSellers.slice(0, 10).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* Value props strip */}
      <section className="mx-auto max-w-7xl px-4 pb-10">
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
          {[
            { icon: Leaf, title: "Handpicked fresh", body: "Every item selected from our warehouse shelves" },
            { icon: ShoppingBasket, title: "Packed with care", body: "Fragile items cushioned, cold items insulated" },
            { icon: Truck, title: "Sent fast", body: "Handed to our delivery partner the same day" },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-3 rounded-xl bg-primary/5 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Daily Staples */}
      {dailyStaples.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <SectionHeading
            title="Daily Staples"
            subtitle="Rice, atta, dal, oil, and spices — always in stock"
            href="/shop"
            badge={<span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent"><Percent className="h-3 w-3" /> Everyday low prices</span>}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {dailyStaples.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeading({
  title,
  subtitle,
  href,
  badge,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold text-foreground sm:text-2xl">{title}</h2>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link to={href} className="shrink-0 text-sm font-semibold text-primary hover:underline">
          View all →
        </Link>
      )}
    </div>
  );
}
