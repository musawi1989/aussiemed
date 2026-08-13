"use client";

import Link from "next/link";
import { useState } from "react";
import { NotifyMe } from "./NotifyMe";
import { PriceBreaks, VatNote } from "./PriceBreaks";
import { QtyInput } from "./QtyInput";
import { WishlistButton } from "./WishlistButton";
import {
  displayPrice,
  formatAED,
  lineTotal,
  nextTierFor,
  packFor,
  pricePerEach,
  savingPercent,
  unitPriceFor,
} from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export function BuyBox({ product }: { product: Product }) {
  const { addToCart, qtyInCart, ready, addToQuote, inQuote, includeVat } =
    useStore();
  const [packId, setPackId] = useState(product.defaultPackId);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [quoted, setQuoted] = useState(false);

  const pack = packFor(product, packId);
  const netUnit = unitPriceFor(pack.priceAED, pack.tiers, qty);
  const netTotal = lineTotal(pack.priceAED, pack.tiers, qty);
  const shownUnit = displayPrice(netUnit, product.taxClass, includeVat);
  const shownTotal = displayPrice(netTotal, product.taxClass, includeVat);
  const nextTier = nextTierFor(pack.tiers, qty);
  const inCart = ready ? qtyInCart(product.id, pack.id) : 0;
  const discounted = netUnit < pack.priceAED;
  const unavailable = product.outOfStock || pack.outOfStock;

  return (
    <div className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      {/* ---------- variants ---------- */}
      {product.variants.map((axis) => (
        <div key={axis.name} className="mb-4">
          <p className="mb-1.5 text-sm">
            <span className="font-bold text-text">{axis.name}:</span>{" "}
            <span className="text-text-muted">{axis.selected}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {axis.options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.value !== axis.selected}
                aria-pressed={option.value === axis.selected}
                title={
                  option.value === axis.selected
                    ? undefined
                    : !option.available
                      ? `${option.value} is not currently stocked`
                      : `${option.value} is a separate listing until variants are linked in the backend`
                }
                className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  option.value === axis.selected
                    ? "border-navy bg-navy-soft text-navy"
                    : option.available
                      ? "cursor-not-allowed border-border-base bg-surface text-text-subtle"
                      : "cursor-not-allowed border-border-base bg-surface-sunken text-text-subtle line-through"
                }`}
              >
                {option.value}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* ---------- unit of measure ---------- */}
      {product.packs.length > 1 && (
        <div className="mb-4">
          <p className="mb-1.5 text-sm">
            <span className="font-bold text-text">Unit:</span>{" "}
            <span className="text-text-muted">{pack.label}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {product.packs.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setPackId(option.id)}
                aria-pressed={option.id === pack.id}
                className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  option.id === pack.id
                    ? "border-navy bg-navy-soft text-navy"
                    : "border-border-strong bg-surface text-text hover:border-navy"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---------- price ---------- */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-3xl font-bold tnum text-text">
          {formatAED(shownUnit)}
        </span>
        <span className="text-sm text-text-muted">per {pack.shortLabel.toLowerCase()}</span>
        <VatNote taxClass={product.taxClass} />
      </div>

      {pack.eachesPerPack > 1 && (
        <p className="mt-1 text-sm text-text-muted tnum">
          {formatAED(
            displayPrice(pricePerEach(pack, qty), product.taxClass, includeVat)
          )}{" "}
          per {product.unit.toLowerCase()}
        </p>
      )}

      {discounted && (
        <p className="mt-1 text-sm">
          <span className="text-text-muted line-through tnum">
            {formatAED(displayPrice(pack.priceAED, product.taxClass, includeVat))}
          </span>{" "}
          <span className="font-bold text-accent">
            {savingPercent(pack.priceAED, netUnit)}% volume discount applied
          </span>
        </p>
      )}

      <hr className="my-4 border-border-base" />

      {unavailable ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-danger">
            {product.badges.includes("back-soon")
              ? "Back soon"
              : "Currently out of stock"}
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
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Quantity
              </span>
              <QtyInput value={qty} onChange={setQty} />
            </div>
            <div className="flex-1 text-right">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Line total
              </span>
              <span className="text-xl font-bold tnum text-text">
                {formatAED(shownTotal)}
              </span>
            </div>
          </div>

          {nextTier && (
            <p className="rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm text-accent">
              Add {nextTier.minQty - qty} more to drop to{" "}
              <strong className="tnum">
                {formatAED(
                  displayPrice(nextTier.priceAED, product.taxClass, includeVat)
                )}
              </strong>{" "}
              per {pack.shortLabel.toLowerCase()}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                addToCart(product.id, pack.id, qty);
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1800);
              }}
              className="h-11 flex-1 rounded-card bg-red px-4 font-bold text-on-red transition-colors hover:bg-red-hover"
            >
              {added ? "Added to cart" : "Add to cart"}
            </button>
            <WishlistButton productId={product.id} className="h-11 px-4" withLabel />
          </div>

          {inCart > 0 && (
            <p className="text-sm text-text-muted">
              <span className="tnum">{inCart}</span> {pack.shortLabel.toLowerCase()}
              {inCart === 1 ? "" : "es"} already in your{" "}
              <Link href="/cart" className="font-bold text-navy hover:underline">
                cart
              </Link>
            </p>
          )}
        </div>
      )}

      {/* Quote enquiry stays available even when the line is unavailable. */}
      <hr className="my-4 border-border-base" />
      <button
        type="button"
        onClick={() => {
          addToQuote(product.id, pack.id, qty);
          setQuoted(true);
          window.setTimeout(() => setQuoted(false), 1800);
        }}
        className="w-full rounded-card border border-border-strong bg-surface px-4 py-2.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
      >
        {quoted ? "Added to quote" : "Add to quote request"}
      </button>
      {ready && inQuote(product.id) && !quoted && (
        <p className="mt-2 text-center text-sm text-text-muted">
          On your{" "}
          <Link href="/quote" className="font-bold text-navy hover:underline">
            quote request
          </Link>
        </p>
      )}

      {pack.tiers.length > 0 && (
        <>
          <hr className="my-4 border-border-base" />
          <h2 className="mb-2 text-sm font-bold text-text">Volume pricing</h2>
          <PriceBreaks
            pack={pack}
            taxClass={product.taxClass}
            currentQty={qty}
          />
        </>
      )}
    </div>
  );
}
