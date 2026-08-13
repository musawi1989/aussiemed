"use client";

import Link from "next/link";
import { useState } from "react";
import { NotifyMe } from "./NotifyMe";
import { QtyInput } from "./QtyInput";
import { TierTable } from "./TierTable";
import { WishlistButton } from "./WishlistButton";
import {
  formatAED,
  lineTotal,
  nextTierFor,
  savingPercent,
  unitPriceFor,
} from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export function BuyBox({ product }: { product: Product }) {
  const { addToCart, qtyInCart, ready, addToQuote, inQuote } = useStore();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [quoted, setQuoted] = useState(false);

  const unitPrice = unitPriceFor(product.priceAED, product.tiers, qty);
  const total = lineTotal(product.priceAED, product.tiers, qty);
  const nextTier = nextTierFor(product.tiers, qty);
  const inCart = ready ? qtyInCart(product.id) : 0;
  const discounted = unitPrice < product.priceAED;

  return (
    <div className="rounded-panel border border-border-base bg-surface p-5 shadow-card">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tracking-tight tnum text-text">
          {formatAED(unitPrice)}
        </span>
        <span className="text-sm text-text-muted">
          per {product.unit.toLowerCase()}
        </span>
      </div>

      {discounted && (
        <p className="mt-1 text-sm text-text-muted">
          <span className="line-through tnum">{formatAED(product.priceAED)}</span>{" "}
          <span className="font-medium text-accent">
            {savingPercent(product.priceAED, unitPrice)}% volume discount applied
          </span>
        </p>
      )}

      <p className="mt-1 text-xs text-text-subtle">
        Excluding 5% VAT · {product.unit}
        {product.packSize ? ` · ${product.packSize}` : ""}
      </p>

      <hr className="my-4 border-border-base" />

      {product.outOfStock ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-danger">
            Currently out of stock
          </p>
          <p className="text-sm text-text-muted">
            Leave your email and we&rsquo;ll let you know the moment it&rsquo;s
            available again.
          </p>
          <NotifyMe productName={product.name} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Quantity
              </span>
              <QtyInput value={qty} onChange={setQty} />
            </div>
            <div className="flex-1 text-right">
              <span className="mb-1 block text-xs font-medium text-text-muted">
                Line total
              </span>
              <span className="text-xl font-semibold tnum text-text">
                {formatAED(total)}
              </span>
            </div>
          </div>

          {nextTier && (
            <p className="rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm text-accent">
              Add {nextTier.minQty - qty} more to drop to{" "}
              <strong className="tnum">{formatAED(nextTier.priceAED)}</strong> per{" "}
              {product.unit.toLowerCase()}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                addToCart(product.id, qty);
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1800);
              }}
              className="h-11 flex-1 rounded-card bg-brand px-4 font-medium text-on-brand transition-colors hover:bg-brand-hover"
            >
              {added ? "Added to cart" : "Add to cart"}
            </button>
            <WishlistButton
              productId={product.id}
              className="h-11 px-4"
              withLabel
            />
          </div>

          {inCart > 0 && (
            <p className="text-sm text-text-muted">
              <span className="tnum">{inCart}</span> already in your{" "}
              <Link href="/cart" className="font-medium text-brand hover:underline">
                cart
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Quote enquiry stays available even when the line is out of stock —
          asking for a price on something unavailable today is normal trade. */}
      <hr className="my-4 border-border-base" />
      <button
        type="button"
        onClick={() => {
          addToQuote(product.id, qty);
          setQuoted(true);
          window.setTimeout(() => setQuoted(false), 1800);
        }}
        className="w-full rounded-card border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
      >
        {quoted ? "Added to quote" : "Add to quote request"}
      </button>
      {ready && inQuote(product.id) && !quoted && (
        <p className="mt-2 text-center text-sm text-text-muted">
          On your{" "}
          <Link href="/quote" className="font-medium text-brand hover:underline">
            quote request
          </Link>
        </p>
      )}

      {product.tiers.length > 0 && (
        <>
          <hr className="my-4 border-border-base" />
          <h2 className="mb-2 text-sm font-semibold text-text">Volume pricing</h2>
          <TierTable
            basePriceAED={product.priceAED}
            tiers={product.tiers}
            unit={product.unit}
            currentQty={qty}
          />
        </>
      )}
    </div>
  );
}
