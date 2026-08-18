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
import type { SnapshotProduct } from "./types";

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
  products: SnapshotProduct[];
  getProductById: (id: number) => SnapshotProduct | undefined;
  getProductBySlug: (slug: string) => SnapshotProduct | undefined;
  suggest: (term: string, limit?: number) => SnapshotProduct[];
};

const CatalogContext = createContext<CatalogValue | null>(null);

export function CatalogProvider({
  initialProducts,
  children,
}: {
  initialProducts: SnapshotProduct[];
  children: ReactNode;
}) {
  const [products, setProducts] = useState<SnapshotProduct[]>(initialProducts);
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

    return {
      ready,
      products,
      getProductById: (id) => byId.get(id),
      getProductBySlug: (slug) => bySlug.get(slug),
      suggest: (term, limit = 6) => suggestFrom(products, term, limit),
    };
  }, [products, ready]);

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}
