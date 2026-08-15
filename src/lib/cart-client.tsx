"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The cart, held on the server.
 *
 * Every mutation posts to /api/v1/cart and the response replaces local state,
 * so the browser never computes a price and never disagrees with the database.
 * The cart survives a change of device once sign-in exists, which localStorage
 * never could.
 */

export type ServerCartLine = {
  id: string;
  skuId: string;
  skuCode: string;
  productSlug: string;
  productName: string;
  brand: string | null;
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
  taxClass: string;
  qty: number;
  unitPriceFils: number;
  lineTotalFils: number;
  vatFils: number;
  basePriceFils: number;
  outOfStock: boolean;
  image: string | null;
};

export type ServerCart = {
  cartKey: string | null;
  lines: ServerCartLine[];
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
  zeroRatedFils: number;
  itemCount: number;
};

const EMPTY: ServerCart = {
  cartKey: null,
  lines: [],
  subtotalFils: 0,
  vatFils: 0,
  totalFils: 0,
  zeroRatedFils: 0,
  itemCount: 0,
};

type CartValue = {
  cart: ServerCart;
  /** False until the first load completes, so the UI can avoid a flash. */
  ready: boolean;
  busy: boolean;
  error: string | null;
  addBySku: (skuCode: string, qty?: number) => Promise<boolean>;
  setLineQty: (itemId: string, qty: number) => Promise<void>;
  removeLine: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  qtyOfSku: (skuCode: string) => number;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<ServerCart>(EMPTY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(
    async (method: string, body?: unknown): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/cart", {
          method,
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) {
          // Out of stock and similar are expected outcomes, not crashes.
          setError(data?.error?.message ?? "Could not update the cart");
          return false;
        }
        setCart(data.cart ?? EMPTY);
        return true;
      } catch {
        setError("Could not reach the server");
        return false;
      } finally {
        setBusy(false);
        setReady(true);
      }
    },
    []
  );

  useEffect(() => {
    void call("GET");
  }, [call]);

  const value = useMemo<CartValue>(
    () => ({
      cart,
      ready,
      busy,
      error,
      addBySku: (skuCode, qty = 1) => call("POST", { skuCode, qty }),
      setLineQty: async (itemId, qty) => {
        await call("PATCH", { itemId, qty });
      },
      removeLine: async (itemId) => {
        await call("DELETE", { itemId });
      },
      clear: async () => {
        await call("DELETE", {});
      },
      refresh: async () => {
        await call("GET");
      },
      qtyOfSku: (skuCode) =>
        cart.lines.find((l) => l.skuCode === skuCode)?.qty ?? 0,
    }),
    [cart, ready, busy, error, call]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/** Fils to AED for display. The server is the only thing that does arithmetic. */
export const aed = (fils: number) => fils / 100;
