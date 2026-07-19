import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getProduct, listProducts } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { formatCents } from "@/lib/format";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ProductCard } from "@/components/product-card";
import { Reveal } from "@/components/reveal";
import {
  ChevronRight,
  Heart,
  Leaf,
  ShieldCheck,
  Truck,
  ImageOff,
  Snowflake,
  Wheat,
  Fish,
  Milk,
  Sparkles,
  Coffee,
  Package,
} from "lucide-react";
import { toast } from "sonner";

type TrustTag = { icon: React.ComponentType<{ className?: string }>; label: string };

const DEFAULT_TAGS: TrustTag[] = [
  { icon: Truck, label: "Free delivery over ₹499" },
  { icon: Leaf, label: "Farm-fresh from warehouse" },
  { icon: ShieldCheck, label: "Quality-checked" },
];

const CATEGORY_TAGS: Record<string, TrustTag[]> = {
  "fruits-vegetables": [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Leaf, label: "Farm-fresh daily" },
    { icon: ShieldCheck, label: "Hand-picked & sorted" },
  ],
  "dairy-eggs": [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Snowflake, label: "Cold-chain delivered" },
    { icon: Milk, label: "Sourced from local dairies" },
  ],
  bakery: [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Wheat, label: "Baked fresh" },
    { icon: ShieldCheck, label: "No preservatives" },
  ],
  "meat-seafood": [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Snowflake, label: "Cold-chain delivered" },
    { icon: Fish, label: "Fresh from source" },
  ],
  pantry: [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Package, label: "Sealed & tamper-proof" },
    { icon: ShieldCheck, label: "Quality-checked" },
  ],
  beverages: [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Coffee, label: "Sealed for freshness" },
    { icon: ShieldCheck, label: "Quality-checked" },
  ],
  cosmetics: [
    { icon: Truck, label: "Free delivery over ₹499" },
    { icon: Sparkles, label: "100% authentic" },
    { icon: ShieldCheck, label: "Dermatologically safe" },
  ],
};

function getTrustTags(
  productTags: string[] | null | undefined,
  categoryTags: string[] | null | undefined,
  categorySlug: string | null | undefined,
): TrustTag[] {
  if (productTags && productTags.length > 0) {
    return productTags.map((label) => ({ icon: ShieldCheck, label }));
  }
  if (categoryTags && categoryTags.length > 0) {
    return categoryTags.map((label) => ({ icon: ShieldCheck, label }));
  }
  if (categorySlug && CATEGORY_TAGS[categorySlug]) return CATEGORY_TAGS[categorySlug];
  return DEFAULT_TAGS;
}

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData({
      queryKey: ["product", params.slug],
      queryFn: () => getProduct({ data: { slug: params.slug } }),
    });
    if (!product) throw notFound();
    await context.queryClient.ensureQueryData({
      queryKey: ["products", { category: product.categories?.slug ?? null }],
      queryFn: () =>
        listProducts({ data: product.categories ? { categorySlug: product.categories.slug } : {} }),
    });
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} — FEABazaar` },
          { name: "description", content: loaderData.product.description ?? "" },
          { property: "og:title", content: `${loaderData.product.name} — FEABazaar` },
          { property: "og:description", content: loaderData.product.description ?? "" },
          ...(loaderData.product.image_url
            ? [{ property: "og:image", content: loaderData.product.image_url }]
            : []),
        ]
      : [],
  }),
  component: ProductPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl">Product not found</h1>
      <Link to="/shop" className="mt-4 inline-block text-primary hover:underline">
        Back to shop
      </Link>
    </div>
  ),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl">Something went wrong</h1>
    </div>
  ),
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data: product } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => getProduct({ data: { slug } }),
  });
  const { data: relatedRaw = [] } = useQuery({
    queryKey: ["products", { category: product?.categories?.slug ?? null }],
    queryFn: () =>
      listProducts({ data: product?.categories ? { categorySlug: product.categories.slug } : {} }),
    enabled: !!product,
  });
  const { add } = useCart();
  const [qty, setQty] = useState(1);

  if (!product) return null;

  // Calculate discount from real mrp_cents field
  const hasDiscount = product.mrp_cents && product.mrp_cents > product.price_cents;
  const discountPct = hasDiscount
    ? Math.round(((product.mrp_cents! - product.price_cents) / product.mrp_cents!) * 100)
    : 0;
  const related = relatedRaw.filter((p) => p.id !== product.id).slice(0, 6);

  return (
    <div className="bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/shop" className="hover:text-primary">
            Shop
          </Link>
          {product.categories && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link
                to="/shop"
                search={{ category: product.categories.slug }}
                className="hover:text-primary"
              >
                {product.categories.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="line-clamp-1 font-medium text-foreground">{product.name}</span>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="grid gap-6 rounded-2xl border border-border bg-card p-4 md:grid-cols-[1fr_1.1fr] md:p-6">
          {/* Gallery */}
          <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
              {hasDiscount && discountPct > 0 && (
                <span className="absolute left-3 top-3 z-10 rounded-md bg-accent px-2 py-1 text-xs font-bold text-accent-foreground shadow">
                  {discountPct}% OFF
                </span>
              )}
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-10 w-10" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-col animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 delay-100 ease-out">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {product.brand || "FEABazaar"} {product.categories && <>· {product.categories.name}</>}
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold text-foreground md:text-3xl">
              {product.name}
            </h1>
            <div className="mt-1 text-sm text-muted-foreground">Unit · {product.unit_label}</div>

            <div className="mt-4 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-3xl font-bold text-foreground">
                {formatCents(product.price_cents)}
              </span>
              {hasDiscount && (
                <>
                  <span className="text-base text-muted-foreground line-through">
                    {formatCents(product.mrp_cents!)}
                  </span>
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
                    Save {discountPct}%
                  </span>
                </>
              )}
            </div>
            <div className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <span className="inline-block h-2 w-2 rounded-full bg-primary" /> In stock — usually
              packed the same day
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <QuantityStepper value={qty} onChange={setQty} />
              <Button
                size="lg"
                className="rounded-full px-6"
                onClick={() => {
                  add(
                    {
                      productId: product.id,
                      slug: product.slug,
                      name: product.name,
                      priceCents: product.price_cents,
                      mrpCents: product.mrp_cents,
                      imageUrl: product.image_url,
                      unitLabel: product.unit_label,
                    },
                    qty,
                  );
                  toast.success(`Added ${qty} × ${product.name}`);
                }}
              >
                Add to cart
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full"
                onClick={() => toast.success("Saved to favourites")}
              >
                <Heart className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 grid gap-2 rounded-xl bg-primary/5 p-3 text-xs sm:grid-cols-3">
              {getTrustTags(
                product.tags,
                product.categories?.tags,
                product.categories?.slug,
              ).map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                </span>
              ))}
            </div>

            {product.description && (
              <div className="mt-6">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  Description
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {product.description}
                </p>
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="font-display text-xl font-bold">You may also like</h2>
              <Link
                to="/shop"
                search={product.categories ? { category: product.categories.slug } : {}}
                className="text-sm font-semibold text-primary hover:underline"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {related.map((p, i) => (
                <Reveal key={p.id} index={i} className="h-full">
                  <ProductCard product={p} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
