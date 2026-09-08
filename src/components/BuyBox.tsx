"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSelectedProductPack } from "./ProductGallery";
import { PriceBreaks, VatNote } from "./PriceBreaks";
import { QtyInput } from "./QtyInput";
import { VariantPicker } from "./VariantPicker";
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
import { useCart } from "@/lib/cart-client";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";
import { YourPrice } from "./YourPrice";

/** Is this value sold at all, in any combination? */
function existsAnywhere(
  matrix: Product["combinations"],
  axis: string,
  value: string
) {
  return matrix.some((c) => c.values[axis] === value);
}

/**
 * Would choosing this value leave every other axis where it is?
 *
 * The difference between "you can have this" and "you can have this, but the
 * colour will change" — worth saying before the click rather than after.
 */
function keepsSelection(
  matrix: Product["combinations"],
  chosen: Record<string, string>,
  axis: string,
  value: string
) {
  return matrix.some(
    (c) =>
      c.values[axis] === value &&
      Object.entries(chosen).every(
        ([a, v]) => a === axis || c.values[a] === v
      )
  );
}

export function BuyBox({
  product,
  agreed = {},
  initialSku,
}: {
  product: Product;
  /**
   * skuId to the price this account has agreed, in AED. Empty for anyone not
   * signed in to an account — these are one company's commercial terms and a
   * page rendered for a guest must never carry them.
   */
  agreed?: Record<string, number>;
  initialSku?: string;
}) {
  const { ready, addToQuote, inQuote, includeVat } = useStore();
  const { addBySku, qtyOfSku, busy, error } = useCart();
  const initialCombination = product.combinations.find((entry) => entry.packs.some((pack) => initialSku ? pack.sku === initialSku : pack.id === product.defaultPackId));
  const [packId, setPackId] = useState(
    product.packs.find((pack) => pack.sku === initialSku)?.id ??
    initialCombination?.packs.find((pack) => pack.sku === initialSku)?.id ?? product.defaultPackId
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [quoted, setQuoted] = useState(false);

  /**
   * The chosen point in the variant matrix, as { Size: "Large", Colour: "Blue" }.
   *
   * Held as the values rather than an index, because choosing a size has to
   * survive a change of colour: a buyer who picks Extra Large and then Black
   * means the black extra-large, not the first black thing on the list.
   */
  const [chosen, setChosen] = useState<Record<string, string>>(
    () => initialCombination?.values ?? product.combinations[0]?.values ?? {}
  );

  const matrix = product.combinations;
  const hasMatrix = matrix.length > 0;

  const matches = (values: Record<string, string>) =>
    Object.keys(values).length === Object.keys(chosen).length && Object.entries(chosen).every(([axis, value]) => values[axis] === value);

  const combination = hasMatrix ? matrix.find((c) => matches(c.values)) : undefined;

  /**
   * Everything below prices the SELECTED combination, not the product. Where
   * there is no matrix this is exactly what it was before: the product's own
   * packs.
   */
  const inScope: Product = combination
    ? { ...product, packs: combination.packs, outOfStock: combination.outOfStock }
    : product;

  /**
   * Choosing a value keeps every other axis where it is when that is still a
   * real combination, and repairs them when it is not — pick Extra Large in a
   * colour that has no extra-large and the colour moves, rather than the page
   * showing a combination nobody can buy.
   */
  function choose(axis: string, value: string) {
    const next = { ...chosen, [axis]: value };
    const exact = matrix.some((c) =>
      Object.entries(next).every(([a, v]) => c.values[a] === v)
    );
    if (exact) {
      setChosen(next);
      return;
    }
    const repaired = matrix.find((c) => c.values[axis] === value);
    if (repaired) setChosen(repaired.values);
  }

  const pack = packFor(inScope, packId);
  const productSelection = useSelectedProductPack();
  const selectPack = productSelection?.select;
  useEffect(() => { selectPack?.(pack.sku); }, [pack.sku, selectPack]);
  /*
   * An agreed price wins outright — it does not stack on a volume break and a
   * break does not improve it. Same rule accountUnitPriceFils applies when the
   * order is priced, which is what stops this screen quoting one figure and
   * the basket another.
   */
  const agreedUnit = agreed[pack.sku];
  const listUnit = unitPriceFor(pack.priceAED, pack.tiers, qty);
  const netUnit = agreedUnit ?? listUnit;
  const netTotal = agreedUnit !== undefined ? agreedUnit * qty : lineTotal(pack.priceAED, pack.tiers, qty);
  const shownUnit = displayPrice(netUnit, product.taxClass, includeVat);
  const shownTotal = displayPrice(netTotal, product.taxClass, includeVat);
  const nextTier = nextTierFor(pack.tiers, qty);
  const inCart = qtyOfSku(pack.sku);
  const discounted = agreedUnit === undefined && netUnit < pack.priceAED;

  return (
    <div className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      {/* ---------- variants ---------- */}
      {product.variants.map((axis) => {
        const current = hasMatrix ? (chosen[axis.name] ?? "") : axis.selected;

        return (
          <div key={axis.name} className="mb-4">
            <p className="mb-1.5 text-sm">
              <span className="font-bold text-text">{axis.name}:</span>{" "}
              <span className="text-text-muted">{current}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {axis.options.map((option) => {
                const selected = option.value === current;

                // Without a matrix nothing is selectable — the axes are
                // stamped-on data with no SKU behind them (DA-11).
                if (!hasMatrix) {
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled
                      aria-pressed={selected}
                      title={
                        selected
                          ? undefined
                          : !option.available
                            ? `${option.value} is not currently stocked`
                            : `${option.value} is a separate listing until variants are linked in the backend`
                      }
                      className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                        selected
                          ? "border-navy bg-navy-soft text-navy"
                          : option.available
                            ? "cursor-not-allowed border-border-base bg-surface text-text-subtle"
                            : "cursor-not-allowed border-border-base bg-surface-sunken text-text-subtle line-through"
                      }`}
                    >
                      {option.value}
                    </button>
                  );
                }

                const exists = existsAnywhere(matrix, axis.name, option.value);
                const stocked = keepsSelection(matrix, chosen, axis.name, option.value);

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => choose(axis.name, option.value)}
                    disabled={!exists}
                    aria-pressed={selected}
                    title={
                      !exists
                        ? `${option.value} is not made in this line`
                        : stocked
                          ? undefined
                          : `${option.value} is not made in this combination — choosing it will change the others`
                    }
                    className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      selected
                        ? "border-navy bg-navy-soft text-navy"
                        : !exists
                          ? "cursor-not-allowed border-border-base bg-surface-sunken text-text-subtle line-through"
                          : stocked
                            ? "border-border-strong bg-surface text-text hover:border-navy"
                            : "border-border-base bg-surface text-text-muted hover:border-navy"
                    }`}
                  >
                    {option.value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ---------- the product family ---------- */}
      <div className="mb-4">
        <VariantPicker product={product} />
      </div>

      {/* Retained for products genuinely sold in more than one unit. Packaging
          levels are normally expressed in the price breaks instead. */}
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
                onClick={() => {
                  setPackId(option.id);
                  const selected = matrix.find(entry => entry.packs.some(pack => pack.id === option.id));
                  if (selected) setChosen(selected.values);
                }}
                aria-pressed={option.id === pack.id}
                className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                  option.id === pack.id
                    ? "border-navy bg-navy-soft text-navy"
                    : "border-border-strong bg-surface text-text hover:border-navy"
                }`}
              >
                {option.label}
                {matrix.length > 1 && (() => {
                  const values = matrix.find(entry => entry.packs.some(pack => pack.id === option.id))?.values;
                  return values && Object.values(values).length ? ` (${Object.values(values).join(", ")})` : "";
                })()}
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
          per {(pack.baseUnitName ?? product.unit).toLowerCase()}
        </p>
      )}

      {/* Their price against the one they would pay at this quantity without
          it — the break where one applies, not the single-unit price. */}
      {agreedUnit !== undefined && (
        <p className="mt-2 text-sm">
          <YourPrice
            yours={displayPrice(agreedUnit, product.taxClass, includeVat)}
            list={displayPrice(listUnit, product.taxClass, includeVat)}
          />
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

      {/* No out-of-stock branch. Every product on the shop can be bought, and
          nothing here says whether we hold it — see ProductBadges for why.
          A line we cannot fill reaches somebody on the admin order, who calls
          the buyer and offers an alternative; a "Currently out of stock" panel
          ended that conversation before it started. */}
      {(
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
              onClick={async () => {
                if (!(await addBySku(pack.sku, qty))) return;
                setAdded(true);
                window.setTimeout(() => setAdded(false), 1800);
              }}
              disabled={busy}
              className="h-11 flex-1 rounded-card bg-red px-4 font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
            >
              {added ? "Added to cart" : "Add to cart"}
            </button>
            <WishlistButton
            productId={product.id}
            slug={product.slug}
            className="h-11 px-4"
            withLabel
          />
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

      {/*
        The bulk price path, alongside the ordinary buy path.

        Called a "bulk buy request" everywhere now, not a "quote request".
        They were one thing wearing two names — the admin queue said one, the
        storefront said the other, and a buyer asking about "my quote" and an
        operator looking at bulk buy requests were talking about the same row
        without either being sure.
      */}
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
        {quoted ? "Added to your request" : "Add to bulk buy request"}
      </button>
      {ready && inQuote(product.id) && !quoted && (
        <p className="mt-2 text-center text-sm text-text-muted">
          On your{" "}
          <Link href="/quote" className="font-bold text-navy hover:underline">
            bulk buy request
          </Link>
        </p>
      )}

      {agreedUnit === undefined && pack.tiers.length > 0 && (
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
