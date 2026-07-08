import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getProduct } from "@/lib/products.functions";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { formatCents } from "@/lib/format";
import { Minus, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/product/")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData({
      queryKey: ["product", params.slug],
      queryFn: () => getProduct({ data: { slug: params.slug } }),
    });
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} — FEA Bazar` },
          { name: "description", content: loaderData.product.description ?? "" },
          { property: "og:title", content: `${loaderData.product.name} — FEA Bazar` },
          { property: "og:description", content: loaderData.product.description ?? "" },
          ...(loaderData.product.image_url ? [{ property: "og:image", content: loaderData.product.image_url }] : []),
        ]
      : [],
  }),
  component: ProductPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="font-display text-2xl">Product not found</h1>
      <Link to="/shop" className="mt-4 inline-block text-primary hover:underline">Back to shop</Link>
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
  const { add } = useCart();
  const [qty, setQty] = useState(1);

  if (!product) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/shop" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to shop
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-border bg-muted">
          {product.image_url && (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div>
          {product.categories && (
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {product.categories.name}
            </div>
          )}
          <h1 className="mt-2 font-display text-3xl font-semibold md:text-4xl">{product.name}</h1>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold">{formatCents(product.price_cents)}</span>
            <span className="text-sm text-muted-foreground">/ {product.unit_label}</span>
          </div>
          {product.description && (
            <p className="mt-4 text-muted-foreground">{product.description}</p>
          )}
          <div className="mt-8 flex items-center gap-4">
            <div className="flex items-center rounded-full border border-border">
              <Button variant="ghost" size="icon" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease">
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center font-medium">{qty}</span>
              <Button variant="ghost" size="icon" onClick={() => setQty(Math.min(99, qty + 1))} aria-label="Increase">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="lg"
              onClick={() => {
                add(
                  {
                    productId: product.id,
                    slug: product.slug,
                    name: product.name,
                    priceCents: product.price_cents,
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
          </div>
        </div>
      </div>
    </div>
  );
}
