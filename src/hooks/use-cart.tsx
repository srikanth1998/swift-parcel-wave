import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  productId: string;
  slug: string;
  name: string;
  priceCents: number;
  /** Real stored MRP, if the product has one. Absent on items added before this field existed. */
  mrpCents?: number | null;
  imageUrl: string | null;
  unitLabel: string;
  qty: number;
  /** Selected product variant, when the product has variants. */
  variantId?: string | null;
  /** Human label of the selected variant, e.g. "5kg". */
  variantLabel?: string | null;
};

/** Stable identity of a cart line: a product + its selected variant. */
export function cartLineId(item: { productId: string; variantId?: string | null }) {
  return `${item.productId}::${item.variantId ?? ""}`;
}

type CartContextValue = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
  itemCount: number;
  subtotalCents: number;
  hydrated: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "fea_bazar_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, hydrated]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    const id = cartLineId(item);
    setItems((prev) => {
      const existing = prev.find((p) => cartLineId(p) === id);
      if (existing) {
        return prev.map((p) =>
          cartLineId(p) === id ? { ...p, qty: Math.min(99, p.qty + qty) } : p,
        );
      }
      return [...prev, { ...item, qty }];
    });
  }, []);

  const setQty = useCallback((lineId: string, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((p) => cartLineId(p) !== lineId)
        : prev.map((p) => (cartLineId(p) === lineId ? { ...p, qty: Math.min(99, qty) } : p)),
    );
  }, []);

  const remove = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((p) => cartLineId(p) !== lineId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      add,
      setQty,
      remove,
      clear,
      itemCount: items.reduce((n, i) => n + i.qty, 0),
      subtotalCents: items.reduce((n, i) => n + i.qty * i.priceCents, 0),
      hydrated,
    }),
    [items, add, setQty, remove, clear, hydrated],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
