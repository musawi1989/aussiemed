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
import { YourPrice } from "./YourPrice";

export function ProductCard({
  product,
  agreed = {},
  siblings,
}: {
  product: Product;
  /** skuId to this account's agreed price in AED. Empty when signed out. */
  agreed?: Record<string, number>;
  /**
   * The other sizes in this product's family, so the card can swap between
   * them without navigating.
   *
   * Passed in rather than fetched: the listing already holds every sibling —
   * each one is its own card in the same grid — so this is a reference to
   * something the page has, not another payload.
   */
  siblings?: Product[];
}) {
  const { includeVat } = useStore();
  const { addBySku, busy } = useCart();

  /*
   * Which size this card is showing.
   *
   * Selecting from the dropdown used to navigate to the chosen product's page,
   * which threw a shopper out of the grid they were browsing and lost their
   * scroll position — to look at the 60ml they had to go to its page and come
   * back. The card swaps what it shows instead. The product page still
   * navigates, because there the URL has to keep describing what is on screen.
   */
  const [slug, setSlug] = useState(product.slug);
  const shown =
    slug === product.slug
      ? product
      : (siblings?.find((s) => s.slug === slug) ?? product);

  // Keyed to the product on show: a 375ml has different packs from a 60ml, so
  // a pack chosen on one is meaningless on the other. Same for quantity —
  // "12" of a carton is not "12" of a bottle.
  const [packId, setPackId] = useState(shown.defaultPackId);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  /*
   * Only offered when the siblings are actually to hand.
   *
   * A card rendered without them — the related products on a product page —
   * has nothing to swap to, so it must go on navigating rather than showing a
   * dropdown that silently does nothing. Undefined here makes the picker fall
   * back to a link, which is the honest behaviour for that card.
   */
  const swap =
    siblings && siblings.length > 1
      ? (next: string) => {
          const target = siblings.find((s) => s.slug === next);
          if (!target) return;
          setSlug(next);
          setPackId(target.defaultPackId);
          setQty(1);
          setAdded(false);
        }
      : undefined;

  const combination = shown.combinations.find((entry) => entry.packs.some((pack) => pack.id === packId));
  const packs = combination?.packs ?? shown.packs;
  const pack = packFor({ ...shown, packs }, packId);
  const href = `/products/${shown.slug}?sku=${encodeURIComponent(pack.sku)}`;
  // A tile has no quantity, so the comparison is against the single-unit
  // price — which is exactly what the tile was already showing.
  const agreedUnit = agreed[pack.sku];
  const unitShown = displayPrice(
    agreedUnit ?? pack.priceAED,
    shown.taxClass,
    includeVat
  );
  const listShown = displayPrice(pack.priceAED, shown.taxClass, includeVat);

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
          <ProductThumb product={{ ...shown, images: pack.images?.length ? pack.images : shown.genericImages ?? shown.images }} className="aspect-[4/3] w-full" />
        </Link>

        <div className="absolute left-2 top-2">
          <ProductBadges product={shown} />
        </div>

        <WishlistButton
          productId={shown.id}
          slug={shown.slug}
          className="absolute right-2 top-2 h-8 w-8 justify-center bg-surface shadow-card"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-text-subtle tnum">
          {pack.sku}
          {shown.brand ? ` · ${shown.brand}` : ""}
        </p>

        <h3 className="text-sm font-medium leading-snug">
          <Link href={href} className="text-text hover:text-navy">
            {shown.name}
            {combination && ` - ${Object.values(combination.values).join(" / ")}`}
          </Link>
        </h3>

        {/* The family dropdown. A buyer who lands on the wrong volume can
            reach the right one without searching again. */}
        <VariantPicker
          product={product}
          size="sm"
          value={slug}
          onSelect={swap}
        />

        {shown.combinations.length > 1 && (
          <label className="block text-xs font-semibold">
            Variant
            <select
              aria-label={`Variant of ${shown.name}`}
              value={combination?.packs[0].id ?? packs[0].id}
              onChange={(event) => { setPackId(event.target.value); setQty(1); setAdded(false); }}
              className="mt-1 h-9 w-full rounded-card border border-border-strong bg-surface px-2 text-text"
            >
              {shown.combinations.map((entry) => (
                <option key={entry.packs[0].id} value={entry.packs[0].id}>
                  {Object.values(entry.values).join(" / ")} - {formatAED(entry.packs[0].priceAED)}
                </option>
              ))}
            </select>
          </label>
        )}

        {packs.length > 1 && (
          <label className="block text-xs font-semibold">
            Pack
            <select value={pack.id} onChange={(event) => { setPackId(event.target.value); setQty(1); }}
              className="mt-1 h-9 w-full rounded-card border border-border-strong bg-surface px-2 text-text">
              {packs.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </label>
        )}

        <div className="mt-auto space-y-2 pt-1">
          {/*
            An agreed price REPLACES the break table rather than sitting above
            it.

            A break does not improve an agreed price and an agreed price does
            not stack on a break — accountUnitPriceFils takes the agreed figure
            outright. Showing this account the break table would advertise four
            prices none of which they will be charged, which is worse than
            showing no table at all.
          */}
          {agreedUnit !== undefined ? (
            <p className="flex flex-wrap items-baseline gap-1.5">
              <YourPrice yours={unitShown} list={listShown} />
              <span className="text-xs text-text-muted">
                per {pack.shortLabel.toLowerCase()}
              </span>
            </p>
          ) : pack.tiers.length > 0 ? (
            <PriceBreaks pack={pack} taxClass={shown.taxClass} compact />
          ) : (
            <p className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold tnum text-text">
                {agreedUnit !== undefined ? (
                  <YourPrice yours={unitShown} list={listShown} />
                ) : (
                  formatAED(unitShown)
                )}
              </span>
              <span className="text-xs text-text-muted">
                per {pack.shortLabel.toLowerCase()}
              </span>
            </p>
          )}

          <p className="text-xs font-semibold text-text-muted">
            {pack.label}
          </p>

          {/* Every card offers Add to cart, stocked or not. "Notify me" told a
              buyer we had none and sent them to a competitor; letting the order
              through instead puts the line in front of somebody here who can
              offer an alternative. Stock is a staff fact — see ProductBadges. */}
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
        </div>
      </div>
    </article>
  );
}
