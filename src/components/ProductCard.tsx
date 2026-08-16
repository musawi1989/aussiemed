"use client";

import Link from "next/link";
import { useState } from "react";
import { PriceBreaks } from "./PriceBreaks";
import { ProductBadges } from "./ProductBadges";
import { ProductThumb } from "./ProductThumb";
import { QtyInput } from "./QtyInput";
import { VariantPicker } from "./VariantPicker";
import { WishlistButton } from "./WishlistButton";
import { displayPrice, formatAED, packFor } from "@/lib/money";
import { useCart } from "@/lib/cart-client";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export function ProductCard({ product }: { product: Product }) {
  const { includeVat } = useStore();
  const { addBySku, busy } = useCart();
  const [packId, setPackId] = useState(product.defaultPackId);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const pack = packFor(product, packId);
  const href = `/products/${product.slug}`;
  const unitShown = displayPrice(pack.priceAED, product.taxClass, includeVat);

  const handleAdd = async () => {
    const ok = await addBySku(pack.sku, qty);
    if (!ok) return;
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-border-base bg-surface shadow-card transition-shadow hover:shadow-raised">
      <div className="relative">
        <Link href={href} className="block" tabIndex={-1} aria-hidden="true">
          <ProductThumb product={product} className="aspect-[4/3] w-full" />
        </Link>

        <div className="absolute left-2 top-2">
          <ProductBadges product={product} />
        </div>

        <WishlistButton
          productId={product.id}
          slug={product.slug}
          className="absolute right-2 top-2 h-8 w-8 justify-center bg-surface shadow-card"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-text-subtle tnum">
          {pack.sku}
          {product.brand ? ` · ${product.brand}` : ""}
        </p>

        <h3 className="text-sm font-medium leading-snug">
          <Link href={href} className="text-text hover:text-navy">
            {product.name}
          </Link>
        </h3>

        {/* The family dropdown. A buyer who lands on the wrong volume can
            reach the right one without searching again. */}
        <VariantPicker product={product} size="sm" />

        <div className="mt-auto space-y-2 pt-1">
          {/* The break table, not just a badge — this is what buyers compare. */}
          {pack.tiers.length > 0 ? (
            <PriceBreaks pack={pack} taxClass={product.taxClass} compact />
          ) : (
            <p className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tnum text-text">
                {formatAED(unitShown)}
              </span>
              <span className="text-xs text-text-muted">
                per {pack.shortLabel.toLowerCase()}
              </span>
            </p>
          )}

          <p className="text-xs font-semibold text-text-muted">
            {pack.label}
          </p>

          {product.outOfStock || pack.outOfStock ? (
            <Link
              href={href}
              className="flex h-9 items-center justify-center rounded-card border border-border-strong bg-surface text-sm font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Notify me
            </Link>
          ) : (
            <div className="flex flex-col gap-2">
              <QtyInput value={qty} onChange={setQty} size="sm" block />
              <button
                type="button"
                onClick={handleAdd}
                disabled={busy}
                className="h-9 w-full whitespace-nowrap rounded-card bg-red px-3 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
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
