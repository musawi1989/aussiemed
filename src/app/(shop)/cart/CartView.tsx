"use client";

import Image from "next/image";
import Link from "next/link";
import { QtyInput } from "@/components/QtyInput";
import { aed, useCart } from "@/lib/cart-client";
import { formatAED } from "@/lib/money";

/**
 * Renders the server's cart. Every figure shown here was computed by the
 * database side, so what the buyer reads is what checkout will charge.
 */
export function CartView() {
  const { cart, ready, busy, error, setLineQty, removeLine, clear } = useCart();

  if (!ready) {
    return (
      <div className="rounded-card border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading your cart&hellip;
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="rounded-card border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-bold text-text">Your cart is empty</h2>
        <p className="mt-2 text-sm text-text-muted">
          Browse the catalogue to start an order.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-red px-5 py-2.5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const savings = cart.lines.reduce(
    (sum, l) => sum + (l.basePriceFils - l.unitPriceFils) * l.qty,
    0
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        {error && (
          <p className="mb-3 rounded-card border border-danger bg-danger-soft px-4 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <ul className="space-y-3">
          {cart.lines.map((line) => {
            const discounted = line.unitPriceFils < line.basePriceFils;
            return (
              <li
                key={line.id}
                className="rounded-card border border-border-base bg-surface p-3 shadow-card"
              >
                <div className="flex gap-4">
                  <Link
                    href={`/products/${line.productSlug}`}
                    className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card bg-surface-sunken"
                    tabIndex={-1}
                  >
                    {line.image && (
                      <Image
                        src={line.image}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        {line.brand && (
                          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
                            {line.brand}
                          </p>
                        )}
                        <h2 className="text-sm font-medium leading-snug text-text">
                          <Link
                            href={`/products/${line.productSlug}`}
                            className="hover:text-navy"
                          >
                            {line.productName}
                          </Link>
                        </h2>
                        <p className="mt-0.5 text-xs text-text-subtle tnum">
                          {line.skuCode} &middot; {line.unitLabel}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={busy}
                        className="shrink-0 rounded-card px-2 py-1 text-xs text-text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <QtyInput
                        value={line.qty}
                        onChange={(qty) => setLineQty(line.id, qty)}
                        size="sm"
                      />

                      <div className="text-right">
                        <p className="text-xs text-text-muted tnum">
                          {formatAED(aed(line.unitPriceFils))} per{" "}
                          {line.unitShortLabel.toLowerCase()}
                          {discounted && (
                            <span className="ml-1.5 font-bold text-accent">
                              &minus;
                              {Math.round(
                                ((line.basePriceFils - line.unitPriceFils) /
                                  line.basePriceFils) *
                                  100
                              )}
                              %
                            </span>
                          )}
                          {line.vatFils === 0 && (
                            <span className="ml-1.5 font-bold text-success">
                              VAT free
                            </span>
                          )}
                        </p>
                        <p className="text-base font-bold tnum text-text">
                          {formatAED(aed(line.lineTotalFils))}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-between">
          <Link
            href="/products"
            className="text-sm font-bold text-navy hover:underline"
          >
            &larr; Continue shopping
          </Link>
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="text-sm text-text-muted hover:text-danger disabled:opacity-50"
          >
            Clear cart
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-40 lg:self-start">
        <div className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold text-text">Order summary</h2>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">
                Subtotal (<span className="tnum">{cart.itemCount}</span>{" "}
                {cart.itemCount === 1 ? "item" : "items"})
              </dt>
              <dd className="font-bold tnum text-text">
                {formatAED(aed(cart.subtotalFils))}
              </dd>
            </div>

            {savings > 0 && (
              <div className="flex justify-between">
                <dt className="text-accent">Volume savings</dt>
                <dd className="font-bold tnum text-accent">
                  &minus;{formatAED(aed(savings))}
                </dd>
              </div>
            )}

            {cart.zeroRatedFils > 0 && (
              <div className="flex justify-between">
                <dt className="text-success">Of which VAT free</dt>
                <dd className="font-bold tnum text-success">
                  {formatAED(aed(cart.zeroRatedFils))}
                </dd>
              </div>
            )}

            <div className="flex justify-between">
              <dt className="text-text-muted">VAT</dt>
              <dd className="font-bold tnum text-text">
                {formatAED(aed(cart.vatFils))}
              </dd>
            </div>

            <div className="flex justify-between border-t border-border-base pt-3">
              <dt className="font-bold text-text">Total</dt>
              <dd className="text-lg font-bold tnum text-text">
                {formatAED(aed(cart.totalFils))}
              </dd>
            </div>
          </dl>

          <Link
            href="/checkout"
            className="mt-5 flex h-11 items-center justify-center rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover"
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
