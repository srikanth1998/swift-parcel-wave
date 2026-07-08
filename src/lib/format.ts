// Prices are stored in the minor unit (paise). Format as Indian Rupees.
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

export function formatCents(paise: number): string {
  return INR.format((paise || 0) / 100);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Deterministic pseudo-MRP + discount for visual polish only.
 * Not persisted — same input always returns same output (SSR-safe).
 * Returns null for ~40% of products (no offer badge).
 */
export function deriveOffer(slug: string, priceCents: number): { mrpCents: number; discountPct: number } | null {
  const h = hashString(slug);
  if (h % 10 < 4) return null;
  const options = [8, 12, 15, 20, 25, 30, 35];
  const pct = options[h % options.length];
  const mrp = Math.round(priceCents / (1 - pct / 100));
  // Round MRP to nearest rupee for a clean strikethrough number
  const rounded = Math.round(mrp / 100) * 100;
  return { mrpCents: rounded, discountPct: pct };
}

export function generateOrderNumber(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `FEA-${yy}${mm}${dd}-${rand}`;
}