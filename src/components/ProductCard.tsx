"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductThumb } from "./ProductThumb";
import { QtyInput } from "./QtyInput";
import { WishlistButton } from "./WishlistButton";
import { formatAED, savingPercent } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const bestTier = product.tiers.at(-1);
  const href = `/products/${product.slug}`;

  const handleAdd = () => {
    addToCart(product.id, qty);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-panel border border-border-base bg-surface shadow-card transition-shadow hover:shadow-raised">
      <div className="relative">
        <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
          <ProductThumb product={product} className="aspect-[4/3] w-full" />
        </Link>

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {product.outOfStock && (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              Out of stock
            </span>
          )}
          {bestTier && !product.outOfStock && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              Save {savingPercent(product.priceAED, bestTier.priceAED)}% on{" "}
              {bestTier.minQty}+
            </span>
          )}
        </div>

        <WishlistButton
          productId={product.id}
          className="absolute right-2 top-2 h-8 w-8 justify-center shadow-card"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        {product.brand && (
          <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            {product.brand}
          </p>
        )}

        <h3 className="text-sm font-medium leading-snug text-text">
          <Link href={href} className="hover:text-brand">
            {product.name}
          </Link>
        </h3>

        <p className="text-xs text-text-subtle tnum">
          {product.sku}
          {product.packSize ? ` · ${product.packSize}` : ""}
        </p>

        <div className="mt-auto space-y-2 pt-1">
          <p className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tnum text-text">
              {formatAED(product.priceAED)}
            </span>
            <span className="text-xs text-text-muted">
              per {product.unit.toLowerCase()}
            </span>
          </p>

          {product.outOfStock ? (
            <Link
              href={href}
              className="flex h-10 items-center justify-center rounded-card border border-border-strong bg-surface text-sm font-medium text-text transition-colors hover:bg-surface-hover"
            >
              Notify me
            </Link>
          ) : (
            /* Stacked rather than side by side: at four columns the card is
               narrow enough that an inline quantity control squeezes the
               button until its label wraps and clips. */
            <div className="flex flex-col gap-2">
              <QtyInput value={qty} onChange={setQty} size="sm" block />
              <button
                type="button"
                onClick={handleAdd}
                className="h-9 w-full whitespace-nowrap rounded-card bg-red px-3 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
              >
                {added ? "Added" : "Add to cart"}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
