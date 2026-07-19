import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { formatCents } from "@/lib/format";
import { toast } from "sonner";
import { Heart, Plus, ImageOff } from "lucide-react";
import { QuantityStepper } from "./quantity-stepper";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price_cents: number;
  unit_label: string;
  image_url: string | null;
  brand?: string | null;
  mrp_cents?: number | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const { add, items, setQty } = useCart();
  const inCart = items.find((i) => i.productId === product.id);
  const [heartBumpTick, setHeartBumpTick] = useState(0);

  // Calculate discount from real mrp_cents field
  const hasDiscount = product.mrp_cents && product.mrp_cents > product.price_cents;
  const discountPct = hasDiscount
    ? Math.round(((product.mrp_cents! - product.price_cents) / product.mrp_cents!) * 100)
    : 0;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      {hasDiscount && discountPct > 0 && (
        <span className="absolute left-2 top-2 z-10 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground shadow-sm">
          {discountPct}% OFF
        </span>
      )}
      <button
        type="button"
        aria-label="Add to favourites"
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-accent"
        onClick={(e) => {
          e.preventDefault();
          setHeartBumpTick((t) => t + 1);
          toast.success("Saved to favourites");
        }}
      >
        <Heart
          key={heartBumpTick}
          className={`h-4 w-4 ${heartBumpTick > 0 ? "animate-badge-bump" : ""}`}
        />
      </button>

      <Link
        to="/product/$slug"
        params={{ slug: product.slug }}
        className="block aspect-square overflow-hidden bg-muted/60"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-8 w-8" />
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {product.brand || "FEABazaar"}
        </div>
        <Link
          to="/product/$slug"
          params={{ slug: product.slug }}
          className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-foreground hover:text-primary"
        >
          {product.name}
        </Link>
        <div className="text-xs text-muted-foreground">{product.unit_label}</div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className="font-display text-base font-bold leading-tight text-foreground">
              {formatCents(product.price_cents)}
            </div>
            {hasDiscount && (
              <div className="text-[11px] text-muted-foreground">
                MRP <span className="line-through">{formatCents(product.mrp_cents!)}</span>
              </div>
            )}
          </div>
          {inCart ? (
            <div className="animate-in zoom-in-95 fade-in duration-200 ease-out">
              <QuantityStepper
                size="sm"
                value={inCart.qty}
                onChange={(n) => setQty(product.id, n)}
              />
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 rounded-full border-primary/40 px-3 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground"
              onClick={() => {
                add({
                  productId: product.id,
                  slug: product.slug,
                  name: product.name,
                  priceCents: product.price_cents,
                  mrpCents: product.mrp_cents,
                  imageUrl: product.image_url,
                  unitLabel: product.unit_label,
                });
                toast.success(`Added ${product.name}`);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
