"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { suggestFrom } from "./query";
import type { Product, Supplier } from "./types";

/**
 * Client-side view of the catalogue.
 *
 * A browser cannot query the database, so client components read a snapshot
 * served by /api/v1/catalog/snapshot instead of importing the data layer. The
 * server renders the same data through lib/catalog.ts, so both sides agree.
 *
 * The initial snapshot is handed down from the server on first render, so the
 * cart and wishlist resolve immediately rather than flashing empty while a
 * fetch completes.
 */

type CatalogValue = {
  ready: boolean;
  products: Product[];
  getProductById: (id: number) => Product | undefined;
  getProductBySlug: (slug: string) => Product | undefined;
  getSupplierName: (id: number) => string;
  suggest: (term: string, limit?: number) => Product[];
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({
  initialProducts,
  initialSuppliers,
  children,
}: {
  initialProducts: Product[];
  initialSuppliers: Supplier[];
  children: ReactNode;
}) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
  const [ready, setReady] = useState(initialProducts.length > 0);

  // Refresh in the background. Harmless when the snapshot is already current;
  // it matters after a re-seed, when a long-lived tab would otherwise hold a
  // stale catalogue.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/catalog/snapshot")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.products) return;
        setProducts(data.products);
        setSuppliers(data.suppliers ?? []);
        setReady(true);
      })
      .catch(() => {
        // Offline or the API is down — carry on with what the server sent.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<CatalogValue>(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));

    return {
      ready,
      products,
      getProductById: (id) => byId.get(id),
      getProductBySlug: (slug) => bySlug.get(slug),
      getSupplierName: (id) => supplierNames.get(id) ?? `Supplier ${id}`,
      suggest: (term, limit = 6) => suggestFrom(products, term, limit),
    };
  }, [products, suppliers, ready]);

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}
