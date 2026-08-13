"use client";

import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { getAllProducts } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export function WishlistView() {
  const { wishlist, ready } = useStore();

  if (!ready) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading your wishlist&hellip;
      </div>
    );
  }

  const saved = getAllProducts().filter((p) => wishlist.includes(p.id));

  if (saved.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-medium text-text">Nothing saved yet</h2>
        <p className="mt-2 text-sm text-text-muted">
          Use the heart on any product to keep it here for your next order.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="mb-5 text-sm text-text-muted tnum">
        {saved.length} saved {saved.length === 1 ? "product" : "products"}
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {saved.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}
