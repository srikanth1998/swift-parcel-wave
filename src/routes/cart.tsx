import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCents, deriveOffer } from "@/lib/format";
import { getStoreSettings } from "@/lib/settings.functions";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Reveal } from "@/components/reveal";
import { Trash2, ShoppingBag, Tag, ImageOff } from "lucide-react";
import { toast } from "sonner";

const REMOVE_ANIM_MS = 200;

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your cart — FEABazaar" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, subtotalCents, hydrated } = useCart();
  const [coupon, setCoupon] = useState("");
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const { data: settings } = useQuery({
    queryKey: ["store-settings"],
    queryFn: () => getStoreSettings(),
  });
  const taxRateBps = settings?.taxRateBps ?? 500;
  const deliveryChargeCents = settings?.deliveryChargeCents ?? 4000;
  const freeThresholdCents = settings?.freeDeliveryThresholdCents ?? 49900;

  const handleRemove = (productId: string) => {
    if (removingIds.has(productId)) return;
    setRemovingIds((prev) => new Set(prev).add(productId));
    setTimeout(() => {
      remove(productId);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }, REMOVE_ANIM_MS);
  };

  if (!hydrated) return <div className="mx-auto max-w-4xl px-4 py-16" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out px-4 py-24 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-10 w-10" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">
          Browse fresh groceries and add your favourites.
        </p>
        <Button asChild size="lg" className="mt-6 rounded-full">
          <Link to="/shop">Start shopping</Link>
        </Button>
      </div>
    );
  }

  const totalSavings = items.reduce((acc, item) => {
    const off = deriveOffer(item.slug, item.priceCents);
    if (!off) return acc;
    return acc + (off.mrpCents - item.priceCents) * item.qty;
  }, 0);

  const tax = Math.round((subtotalCents * taxRateBps) / 10000);
  const delivery = subtotalCents >= freeThresholdCents ? 0 : deliveryChargeCents;
  const total = subtotalCents + tax + delivery;

  return (
    <div className="bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:grid-cols-[1fr_340px]">
        <div>
          <div className="flex items-end justify-between">
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Your cart</h1>
            <span className="text-sm text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"}
            </span>
          </div>

          {subtotalCents < freeThresholdCents && (
            <div className="mt-4 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out rounded-xl bg-primary/10 px-4 py-2.5 text-xs font-medium text-primary">
              Add {formatCents(freeThresholdCents - subtotalCents)} more for FREE delivery! 🎉
            </div>
          )}

          <ul className="mt-4 space-y-3">
            {items.map((item, i) => {
              const offer = deriveOffer(item.slug, item.priceCents);
              const isRemoving = removingIds.has(item.productId);
              const rowClassName = "flex gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4";
              const rowContent = (
                <>
                  <Link
                    to="/product/$slug"
                    params={{ slug: item.slug }}
                    className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      to="/product/$slug"
                      params={{ slug: item.slug }}
                      className="line-clamp-2 text-sm font-semibold hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">{item.unitLabel}</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-bold">{formatCents(item.priceCents)}</span>
                      {offer && (
                        <>
                          <span className="text-xs text-muted-foreground line-through">
                            {formatCents(offer.mrpCents)}
                          </span>
                          <span className="text-[10px] font-bold text-accent">
                            {offer.discountPct}% OFF
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <QuantityStepper
                        size="sm"
                        value={item.qty}
                        onChange={(n) => setQty(item.productId, n)}
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold">
                          {formatCents(item.priceCents * item.qty)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleRemove(item.productId)}
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              );

              if (isRemoving) {
                return (
                  <li
                    key={item.productId}
                    className={`${rowClassName} animate-out fade-out slide-out-to-left-4 duration-200 ease-in fill-mode-forwards`}
                  >
                    {rowContent}
                  </li>
                );
              }

              return (
                <Reveal as="li" key={item.productId} index={i} className={rowClassName}>
                  {rowContent}
                </Reveal>
              );
            })}
          </ul>
        </div>

        <aside className="h-fit space-y-4 md:sticky md:top-32">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <Tag className="h-3.5 w-3.5" /> Coupon code
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="Enter code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                className="h-9"
              />
              <Button
                variant="outline"
                className="h-9"
                onClick={() => toast.info("Coupons available at checkout")}
              >
                Apply
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-base font-bold">Bill details</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={formatCents(subtotalCents)} />
              {totalSavings > 0 && (
                <Row label="Product savings" value={`− ${formatCents(totalSavings)}`} accent />
              )}
              <Row label={`GST (${(taxRateBps / 100).toString()}%)`} value={formatCents(tax)} />
              <Row
                label="Delivery"
                value={delivery === 0 ? "FREE" : formatCents(delivery)}
                accent={delivery === 0}
              />
            </dl>
            <div className="my-4 border-t border-dashed border-border" />
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base font-bold">Total</span>
              <span className="font-display text-lg font-bold">{formatCents(total)}</span>
            </div>
            {totalSavings > 0 && (
              <div className="mt-2 rounded-md bg-accent/10 px-2 py-1 text-center text-[11px] font-semibold text-accent">
                You save {formatCents(totalSavings)} on this order 🎉
              </div>
            )}
            <Button asChild size="lg" className="mt-5 w-full rounded-full">
              <Link to="/checkout">Proceed to checkout</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${accent ? "text-accent" : "text-foreground"}`}>{value}</dd>
    </div>
  );
}
