// Prices are stored in the minor unit (paise). Format as Indian Rupees.
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCents(paise: number): string {
  return INR.format((paise || 0) / 100);
}

export type Offer = { mrpCents: number; discountPct: number };

/**
 * The saving on a product, derived from its real stored MRP.
 *
 * Returns null when there is no MRP on file or it does not exceed the selling
 * price — in which case the UI must show no badge and no strikethrough.
 *
 * This is the same calculation product-card.tsx and product.$slug.tsx already
 * do inline; centralised here so cart.tsx and shop.tsx use it too instead of
 * `deriveOffer`, which hashed the product *slug* to invent an MRP and discount
 * percentage. Those fabricated numbers were rendered to shoppers as "MRP
 * ₹13.00", "30% OFF" and "You save ₹X", none of which corresponded to any real
 * price — now that every product carries a real mrp_cents, there's no reason
 * to invent one.
 */
export function offerFor(priceCents: number, mrpCents: number | null | undefined): Offer | null {
  if (mrpCents == null || mrpCents <= priceCents) return null;
  return {
    mrpCents,
    discountPct: Math.round(((mrpCents - priceCents) / mrpCents) * 100),
  };
}
