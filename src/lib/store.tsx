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
import { getAllProducts } from "./catalog";
import { normaliseQty, totalsFor, type CartTotals } from "./money";
import type { Product } from "./types";

const CART_KEY = "aussiemed.cart.v1";
const WISHLIST_KEY = "aussiemed.wishlist.v1";
const QUOTE_KEY = "aussiemed.quote.v1";
const SESSION_KEY = "aussiemed.session.v1";

type CartEntry = { productId: number; qty: number };

export type CartLine = CartEntry & { product: Product };

type StoreValue = {
  /** False until localStorage has been read, so the UI can avoid flicker. */
  ready: boolean;
  lines: CartLine[];
  totals: CartTotals;
  addToCart: (productId: number, qty?: number) => void;
  setQty: (productId: number, qty: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  qtyInCart: (productId: number) => number;
  wishlist: number[];
  toggleWishlist: (productId: number) => void;
  inWishlist: (productId: number) => boolean;
  /** Quote cart — priced enquiries, kept separate from the buy-now cart. */
  quoteLines: CartLine[];
  addToQuote: (productId: number, qty?: number) => void;
  setQuoteQty: (productId: number, qty: number) => void;
  removeFromQuote: (productId: number) => void;
  clearQuote: () => void;
  inQuote: (productId: number) => boolean;
  /**
   * Demo-only session flag. Real auth is backend work; this exists so the
   * account area and reorder-first landing can be built and reviewed.
   */
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
};

const StoreContext = createContext<StoreValue | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota — the cart degrades to session-only.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [quoteEntries, setQuoteEntries] = useState<CartEntry[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  // Hydrate after mount: server and first client render must match.
  useEffect(() => {
    setEntries(readJSON<CartEntry[]>(CART_KEY, []));
    setQuoteEntries(readJSON<CartEntry[]>(QUOTE_KEY, []));
    setWishlist(readJSON<number[]>(WISHLIST_KEY, []));
    setSignedIn(readJSON<boolean>(SESSION_KEY, false));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeJSON(CART_KEY, entries);
  }, [entries, ready]);

  useEffect(() => {
    if (ready) writeJSON(QUOTE_KEY, quoteEntries);
  }, [quoteEntries, ready]);

  useEffect(() => {
    if (ready) writeJSON(WISHLIST_KEY, wishlist);
  }, [wishlist, ready]);

  useEffect(() => {
    if (ready) writeJSON(SESSION_KEY, signedIn);
  }, [signedIn, ready]);

  const productsById = useMemo(() => {
    const map = new Map<number, Product>();
    for (const product of getAllProducts()) map.set(product.id, product);
    return map;
  }, []);

  const resolve = useCallback(
    (list: CartEntry[]): CartLine[] =>
      list
        .map((entry) => {
          const product = productsById.get(entry.productId);
          return product ? { ...entry, product } : null;
        })
        .filter((line): line is CartLine => line !== null),
    [productsById]
  );

  const lines = useMemo(() => resolve(entries), [entries, resolve]);
  const quoteLines = useMemo(
    () => resolve(quoteEntries),
    [quoteEntries, resolve]
  );

  const totals = useMemo(
    () =>
      totalsFor(
        lines.map((line) => ({
          basePriceAED: line.product.priceAED,
          tiers: line.product.tiers,
          qty: line.qty,
        }))
      ),
    [lines]
  );

  const addToCart = useCallback(
    (productId: number, qty = 1) => {
      const product = productsById.get(productId);
      if (!product || product.outOfStock) return; // out of stock never enters the cart
      const amount = normaliseQty(qty);
      setEntries((prev) => {
        const existing = prev.find((e) => e.productId === productId);
        return existing
          ? prev.map((e) =>
              e.productId === productId ? { ...e, qty: e.qty + amount } : e
            )
          : [...prev, { productId, qty: amount }];
      });
    },
    [productsById]
  );

  const setQty = useCallback((productId: number, qty: number) => {
    const amount = normaliseQty(qty, 0);
    setEntries((prev) =>
      amount <= 0
        ? prev.filter((e) => e.productId !== productId)
        : prev.map((e) => (e.productId === productId ? { ...e, qty: amount } : e))
    );
  }, []);

  const removeFromCart = useCallback((productId: number) => {
    setEntries((prev) => prev.filter((e) => e.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setEntries([]), []);

  const qtyInCart = useCallback(
    (productId: number) =>
      entries.find((e) => e.productId === productId)?.qty ?? 0,
    [entries]
  );

  // Quote cart. Out-of-stock products are allowed here — asking for a price on
  // something unavailable today is a normal trade enquiry.
  const addToQuote = useCallback((productId: number, qty = 1) => {
    const amount = normaliseQty(qty);
    setQuoteEntries((prev) => {
      const existing = prev.find((e) => e.productId === productId);
      return existing
        ? prev.map((e) =>
            e.productId === productId ? { ...e, qty: e.qty + amount } : e
          )
        : [...prev, { productId, qty: amount }];
    });
  }, []);

  const setQuoteQty = useCallback((productId: number, qty: number) => {
    const amount = normaliseQty(qty, 0);
    setQuoteEntries((prev) =>
      amount <= 0
        ? prev.filter((e) => e.productId !== productId)
        : prev.map((e) => (e.productId === productId ? { ...e, qty: amount } : e))
    );
  }, []);

  const removeFromQuote = useCallback((productId: number) => {
    setQuoteEntries((prev) => prev.filter((e) => e.productId !== productId));
  }, []);

  const clearQuote = useCallback(() => setQuoteEntries([]), []);

  const inQuote = useCallback(
    (productId: number) => quoteEntries.some((e) => e.productId === productId),
    [quoteEntries]
  );

  const signIn = useCallback(() => setSignedIn(true), []);
  const signOut = useCallback(() => setSignedIn(false), []);

  const toggleWishlist = useCallback((productId: number) => {
    setWishlist((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }, []);

  const inWishlist = useCallback(
    (productId: number) => wishlist.includes(productId),
    [wishlist]
  );

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      lines,
      totals,
      addToCart,
      setQty,
      removeFromCart,
      clearCart,
      qtyInCart,
      wishlist,
      toggleWishlist,
      inWishlist,
      quoteLines,
      addToQuote,
      setQuoteQty,
      removeFromQuote,
      clearQuote,
      inQuote,
      signedIn,
      signIn,
      signOut,
    }),
    [
      ready,
      lines,
      totals,
      addToCart,
      setQty,
      removeFromCart,
      clearCart,
      qtyInCart,
      wishlist,
      toggleWishlist,
      inWishlist,
      quoteLines,
      addToQuote,
      setQuoteQty,
      removeFromQuote,
      clearQuote,
      inQuote,
      signedIn,
      signIn,
      signOut,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
