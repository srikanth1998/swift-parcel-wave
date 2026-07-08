import { createFileRoute, Link } from "@tanstack/react-router";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your cart — FEA Bazar" }] }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, subtotalCents, hydrated } = useCart();
  if (!hydrated) return <div className="mx-auto max-w-4xl px-4 py-16" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Browse the shop to find fresh groceries.</p>
        <Button asChild className="mt-6"><Link to="/shop">Start shopping</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_320px]">
      <div>
        <h1 className="font-display text-3xl font-semibold">Your cart</h1>
        <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {items.map((item) => (
            <li key={item.productId} className="flex items-center gap-4 p-4">
              {item.imageUrl && (
                <img src={item.imageUrl} alt={item.name} className="h-16 w-16 rounded-lg object-cover" />
              )}
              <div className="flex-1 min-w-0">
                <Link to="/product/$slug" params={{ slug: item.slug }} className="font-medium hover:text-primary">
                  {item.name}
                </Link>
                <div className="text-xs text-muted-foreground">{item.unitLabel} · {formatCents(item.priceCents)}</div>
              </div>
              <div className="flex items-center rounded-full border border-border">
                <Button variant="ghost" size="icon" onClick={() => setQty(item.productId, item.qty - 1)} aria-label="Decrease">
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">{item.qty}</span>
                <Button variant="ghost" size="icon" onClick={() => setQty(item.productId, item.qty + 1)} aria-label="Increase">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="w-20 text-right font-medium">{formatCents(item.priceCents * item.qty)}</div>
              <Button variant="ghost" size="icon" onClick={() => remove(item.productId)} aria-label="Remove">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </div>
      <aside className="h-fit rounded-2xl border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Order summary</h2>
        <div className="mt-4 flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatCents(subtotalCents)}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Tax & delivery calculated at checkout.</div>
        <Button asChild className="mt-6 w-full" size="lg"><Link to="/checkout">Checkout</Link></Button>
      </aside>
    </div>
  );
}
