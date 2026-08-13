"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductThumb } from "./ProductThumb";
import { QtyInput } from "./QtyInput";
import { formatAED, lineTotal } from "@/lib/money";
import { useStore } from "@/lib/store";
import { formatOrderDate, type ReorderEntry } from "@/lib/demo-account";

/**
 * Reorder-first: the catalogue is secondary for a returning trade buyer, so the
 * account landing leads with what they already buy, pre-filled with the
 * quantity they last ordered.
 */
export function ReorderList({ entries }: { entries: ReorderEntry[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <ReorderRow key={entry.product.id} entry={entry} />
      ))}
    </ul>
  );
}

function ReorderRow({ entry }: { entry: ReorderEntry }) {
  const { addToCart } = useStore();
  const [qty, setQty] = useState(entry.lastQty);
  const [added, setAdded] = useState(false);

  const { product } = entry;
  const total = lineTotal(product.priceAED, product.tiers, qty);

  return (
    <li className="flex gap-3 rounded-panel border border-border-base bg-surface p-3 shadow-card">
      <Link href={`/products/${product.slug}`} className="shrink-0" tabIndex={-1}>
        <ProductThumb
          product={product}
          sizes="64px"
          size="sm"
          className="h-16 w-16 rounded-card"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium leading-snug text-text">
          <Link href={`/products/${product.slug}`} className="hover:text-brand">
            {product.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-xs text-text-subtle tnum">
          Last ordered {formatOrderDate(entry.lastOrderedOn)}
          {entry.timesOrdered > 1 ? ` · ${entry.timesOrdered} times` : ""}
        </p>

        {product.outOfStock ? (
          <p className="mt-2 text-xs font-medium text-danger">
            Out of stock &mdash;{" "}
            <Link href={`/products/${product.slug}`} className="underline">
              get notified
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <QtyInput value={qty} onChange={setQty} size="sm" />
              <button
                type="button"
                onClick={() => {
                  addToCart(product.id, qty);
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 1600);
                }}
                className="h-8 flex-1 whitespace-nowrap rounded-card bg-brand px-2 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
              >
                {added ? "Added" : "Add"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-text-muted tnum">
              {formatAED(total)} for {qty}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
