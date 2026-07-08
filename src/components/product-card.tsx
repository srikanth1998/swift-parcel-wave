import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  unit_label: string;
  image_url: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const { add } = useCart();
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md">
      <Link to="/product/$slug" params={{ slug: product.slug }} className="block aspect-square overflow-hidden bg-muted">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">No image</div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to="/product/$slug" params={{ slug: product.slug }} className="line-clamp-2 font-medium text-foreground hover:text-primary">
          {product.name}
        </Link>
        <div className="text-xs text-muted-foreground">{product.unit_label}</div>
        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="font-display text-lg font-semibold text-foreground">
            {formatCents(product.price_cents)}
          </div>
          <Button
            size="sm"
            onClick={() => {
              add({
                productId: product.id,
                slug: product.slug,
                name: product.name,
                priceCents: product.price_cents,
                imageUrl: product.image_url,
                unitLabel: product.unit_label,
              });
              toast.success(`Added ${product.name}`);
            }}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
