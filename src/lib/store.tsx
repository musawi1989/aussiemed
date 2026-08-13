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
import { normaliseQty, packFor, totalsFor, type CartTotals } from "./money";
import type { Pack, Product } from "./types";

// v2: cart entries gained a packId, so v1 carts are not readable.
const CART_KEY = "aussiemed.cart.v2";
const QUOTE_KEY = "aussiemed.quote.v2";
const WISHLIST_KEY = "aussiemed.wishlist.v1";
const SESSION_KEY = "aussiemed.session.v1";
const VAT_PREF_KEY = "aussiemed.vatPref.v1";

/**
 * packId identifies the unit of measure. A box and a carton of the same
 * product are different purchasable things and must never merge into one line.
 */
type CartEntry = { productId: number; packId: string; qty: number };

export type CartLine = CartEntry & { product: Product; pack: Pack };

/** Uniquely identifies a cart line. */
const keyOf = (productId: number, packId: string) => `${productId}::${packId}`;

type StoreValue = {
  /** False until localStorage has been read, so the UI can avoid flicker. */
  ready: boolean;
  lines: CartLine[];
  totals: CartTotals;
  addToCart: (productId: number, packId: string, qty?: number) => void;
  setQty: (productId: number, packId: string, qty: number) => void;
  removeFromCart: (productId: number, packId: string) => void;
  clearCart: () => void;
  qtyInCart: (productId: number, packId: string) => number;

  wishlist: number[];
  toggleWishlist: (productId: number) => void;
  inWishlist: (productId: number) => boolean;

  quoteLines: CartLine[];
  addToQuote: (productId: number, packId: string, qty?: number) => void;
  setQuoteQty: (productId: number, packId: string, qty: number) => void;
  removeFromQuote: (productId: number, packId: string) => void;
  clearQuote: () => void;
  inQuote: (productId: number) => boolean;

  /**
   * Whether prices render inc. VAT. Trade buyers compare ex-VAT; the person
   * approving the invoice reads inc-VAT. Persisted per browser.
   */
  includeVat: boolean;
  setIncludeVat: (value: boolean) => void;

  /** Demo-only session flag. Real auth is backend work. */
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
  const [includeVat, setIncludeVatState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEntries(readJSON<CartEntry[]>(CART_KEY, []));
    setQuoteEntries(readJSON<CartEntry[]>(QUOTE_KEY, []));
    setWishlist(readJSON<number[]>(WISHLIST_KEY, []));
    setSignedIn(readJSON<boolean>(SESSION_KEY, false));
    setIncludeVatState(readJSON<boolean>(VAT_PREF_KEY, false));
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
  useEffect(() => {
    if (ready) writeJSON(VAT_PREF_KEY, includeVat);
  }, [includeVat, ready]);

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
          if (!product) return null;
          return { ...entry, product, pack: packFor(product, entry.packId) };
        })
        .filter((line): line is CartLine => line !== null),
    [productsById]
  );

  const lines = useMemo(() => resolve(entries), [entries, resolve]);
  const quoteLines = useMemo(() => resolve(quoteEntries), [quoteEntries, resolve]);

  const totals = useMemo(
    () =>
      totalsFor(
        lines.map((line) => ({
          basePriceAED: line.pack.priceAED,
          tiers: line.pack.tiers,
          qty: line.qty,
          taxClass: line.product.taxClass,
        }))
      ),
    [lines]
  );

  /** Shared add/set/remove so the cart and quote cart cannot behave differently. */
  const makeOps = (
    setList: React.Dispatch<React.SetStateAction<CartEntry[]>>,
    { blockOutOfStock }: { blockOutOfStock: boolean }
  ) => ({
    add: (productId: number, packId: string, qty = 1) => {
      const product = productsById.get(productId);
      if (!product) return;
      const pack = packFor(product, packId);
      if (blockOutOfStock && (product.outOfStock || pack.outOfStock)) return;
      const amount = normaliseQty(qty);
      setList((prev) => {
        const existing = prev.find(
          (e) => keyOf(e.productId, e.packId) === keyOf(productId, pack.id)
        );
        return existing
          ? prev.map((e) =>
              keyOf(e.productId, e.packId) === keyOf(productId, pack.id)
                ? { ...e, qty: e.qty + amount }
                : e
            )
          : [...prev, { productId, packId: pack.id, qty: amount }];
      });
    },
    set: (productId: number, packId: string, qty: number) => {
      const amount = normaliseQty(qty, 0);
      setList((prev) =>
        amount <= 0
          ? prev.filter(
              (e) => keyOf(e.productId, e.packId) !== keyOf(productId, packId)
            )
          : prev.map((e) =>
              keyOf(e.productId, e.packId) === keyOf(productId, packId)
                ? { ...e, qty: amount }
                : e
            )
      );
    },
    remove: (productId: number, packId: string) => {
      setList((prev) =>
        prev.filter(
          (e) => keyOf(e.productId, e.packId) !== keyOf(productId, packId)
        )
      );
    },
  });

  const cartOps = useMemo(
    () => makeOps(setEntries, { blockOutOfStock: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productsById]
  );
  // Asking the price of something unavailable today is a normal trade enquiry.
  const quoteOps = useMemo(
    () => makeOps(setQuoteEntries, { blockOutOfStock: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productsById]
  );

  const qtyInCart = useCallback(
    (productId: number, packId: string) =>
      entries.find((e) => keyOf(e.productId, e.packId) === keyOf(productId, packId))
        ?.qty ?? 0,
    [entries]
  );

  const inQuote = useCallback(
    (productId: number) => quoteEntries.some((e) => e.productId === productId),
    [quoteEntries]
  );

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
      addToCart: cartOps.add,
      setQty: cartOps.set,
      removeFromCart: cartOps.remove,
      clearCart: () => setEntries([]),
      qtyInCart,
      wishlist,
      toggleWishlist,
      inWishlist,
      quoteLines,
      addToQuote: quoteOps.add,
      setQuoteQty: quoteOps.set,
      removeFromQuote: quoteOps.remove,
      clearQuote: () => setQuoteEntries([]),
      inQuote,
      includeVat,
      setIncludeVat: setIncludeVatState,
      signedIn,
      signIn: () => setSignedIn(true),
      signOut: () => setSignedIn(false),
    }),
    [
      ready, lines, totals, cartOps, qtyInCart, wishlist, toggleWishlist,
      inWishlist, quoteLines, quoteOps, inQuote, includeVat, signedIn,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
