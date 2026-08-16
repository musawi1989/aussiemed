"use client";

import { useState } from "react";
import { QtyInput } from "./QtyInput";
import { pluraliseUnit } from "@/lib/money";
import { useCart } from "@/lib/cart-client";

/**
 * Quantity and Add to cart, for a list of products someone already knows.
 *
 * My products is a reorder list, not a browsing surface — the buyer chose these
 * once and comes back to buy them again. Making them open each product page to
 * do that is the long way round, so the row buys directly.
 *
 * It adds the smallest active pack, which is what the list already prices. A
 * buyer who wants a different unit opens the product, where every pack and
 * every price break is shown; putting that choice here would rebuild the whole
 * buy box in a card.
 *
 * The quantity is deliberately local. It resets after adding because the number
 * has been spent — leaving "12" in the box invites a second silent add of
 * twelve.
 */
export function QuickBuy({
  skuCode,
  unitShortLabel,
}: {
  skuCode: string;
  unitShortLabel: string | null;
}) {
  const { addBySku, qtyOfSku, busy } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const inCart = qtyOfSku(skuCode);
  const unit = pluraliseUnit(unitShortLabel, 1) || "unit";
  const inCartUnit = pluraliseUnit(unitShortLabel, inCart);

  const add = async () => {
    if (!(await addBySku(skuCode, qty))) return;
    setQty(1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <QtyInput
          value={qty}
          onChange={setQty}
          size="sm"
          label={`Quantity in ${unit}`}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="h-8 flex-1 rounded-card bg-red px-3 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {added ? "Added" : "Add to cart"}
        </button>
      </div>

      {inCart > 0 && (
        <p className="mt-1 text-xs text-text-muted tnum">
          {inCart}
          {inCartUnit && ` ${inCartUnit}`} in your cart
        </p>
      )}
    </div>
  );
}
