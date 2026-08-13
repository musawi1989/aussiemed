"use client";

import Link from "next/link";
import { ProductThumb } from "@/components/ProductThumb";
import { QtyInput } from "@/components/QtyInput";
import {
  formatAED,
  lineTotal,
  nextTierFor,
  savingPercent,
  unitPriceFor,
  VAT_RATE,
} from "@/lib/money";
import { useStore } from "@/lib/store";

export function CartView() {
  const { lines, totals, setQty, removeFromCart, clearCart, ready } = useStore();

  if (!ready) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading your cart&hellip;
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-medium text-text">Your cart is empty</h2>
        <p className="mt-2 text-sm text-text-muted">
          Browse the catalogue to start an order.
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

  const savings = lines.reduce((sum, line) => {
    const unit = unitPriceFor(line.product.priceAED, line.product.tiers, line.qty);
    return sum + (line.product.priceAED - unit) * line.qty;
  }, 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <ul className="space-y-3">
          {lines.map((line) => {
            const unit = unitPriceFor(
              line.product.priceAED,
              line.product.tiers,
              line.qty
            );
            const total = lineTotal(
              line.product.priceAED,
              line.product.tiers,
              line.qty
            );
            const nextTier = nextTierFor(line.product.tiers, line.qty);
            const discounted = unit < line.product.priceAED;

            return (
              <li
                key={line.productId}
                className="rounded-panel border border-border-base bg-surface p-3 shadow-card"
              >
                <div className="flex gap-4">
                  <Link
                    href={`/products/${line.product.slug}`}
                    className="shrink-0"
                    tabIndex={-1}
                  >
                    <ProductThumb
                      product={line.product}
                      sizes="96px"
                      size="sm"
                      className="h-24 w-24 rounded-card"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {line.product.brand && (
                          <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                            {line.product.brand}
                          </p>
                        )}
                        <h2 className="text-sm font-medium leading-snug text-text">
                          <Link
                            href={`/products/${line.product.slug}`}
                            className="hover:text-brand"
                          >
                            {line.product.name}
                          </Link>
                        </h2>
                        <p className="mt-0.5 text-xs text-text-subtle tnum">
                          {line.product.sku}
                          {line.product.packSize ? ` · ${line.product.packSize}` : ""}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(line.productId)}
                        className="shrink-0 rounded-card px-2 py-1 text-xs text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <QtyInput
                        value={line.qty}
                        onChange={(qty) => setQty(line.productId, qty)}
                        size="sm"
                      />

                      <div className="text-right">
                        <p className="text-xs text-text-muted tnum">
                          {formatAED(unit)} per {line.product.unit.toLowerCase()}
                          {discounted && (
                            <span className="ml-1.5 font-medium text-accent">
                              &minus;
                              {savingPercent(line.product.priceAED, unit)}%
                            </span>
                          )}
                        </p>
                        <p className="text-base font-semibold tnum text-text">
                          {formatAED(total)}
                        </p>
                      </div>
                    </div>

                    {nextTier && (
                      <p className="mt-2 text-xs text-accent tnum">
                        Add {nextTier.minQty - line.qty} more to pay{" "}
                        {formatAED(nextTier.priceAED)} each
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-between">
          <Link
            href="/products"
            className="text-sm font-medium text-brand hover:underline"
          >
            &larr; Continue shopping
          </Link>
          <button
            type="button"
            onClick={clearCart}
            className="text-sm text-text-muted hover:text-danger"
          >
            Clear cart
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-40 lg:self-start">
        <div className="rounded-panel border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-text">Order summary</h2>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">
                Subtotal (<span className="tnum">{totals.itemCount}</span>{" "}
                {totals.itemCount === 1 ? "item" : "items"})
              </dt>
              <dd className="font-medium tnum text-text">
                {formatAED(totals.subtotalAED)}
              </dd>
            </div>

            {savings > 0 && (
              <div className="flex justify-between">
                <dt className="text-accent">Volume savings</dt>
                <dd className="font-medium tnum text-accent">
                  &minus;{formatAED(savings)}
                </dd>
              </div>
            )}

            <div className="flex justify-between">
              <dt className="text-text-muted tnum">
                VAT ({Math.round(VAT_RATE * 100)}%)
              </dt>
              <dd className="font-medium tnum text-text">
                {formatAED(totals.vatAED)}
              </dd>
            </div>

            <div className="flex justify-between border-t border-border-base pt-3">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-lg font-semibold tnum text-text">
                {formatAED(totals.totalAED)}
              </dd>
            </div>
          </dl>

          <Link
            href="/checkout"
            className="mt-5 flex h-11 items-center justify-center rounded-card bg-brand font-medium text-on-brand transition-colors hover:bg-brand-hover"
          >
            Proceed to checkout
          </Link>

          <p className="mt-3 text-xs leading-relaxed text-text-subtle">
            Delivery is quoted separately. You&rsquo;ll receive a reference
            number once your order is placed.
          </p>
        </div>
      </aside>
    </div>
  );
}
