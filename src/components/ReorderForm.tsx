"use client";

import { useActionState, useState } from "react";
import { formatAED } from "@/lib/money";
import { reorderAction } from "@/app/(shop)/account/actions";
import type { FormState } from "@/components/AdminForm";
import type { ReorderLine } from "@/lib/account";

const aed = (fils: number) => formatAED(fils / 100);

/**
 * Reviewing a repeat order before it reaches the basket.
 *
 * Everything starts ticked, because "the same as last time" is what a repeat
 * order means and the common case should be one click. Quantities are editable
 * in place, since a practice usually wants the same list in different numbers.
 *
 * Lines that can no longer be bought are shown greyed rather than removed. A
 * buyer repeating an order needs to see that something has dropped out of it —
 * that is precisely the moment they would otherwise not notice.
 */
export function ReorderForm({
  lines,
  cartCount,
}: {
  lines: ReorderLine[];
  cartCount: number;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    reorderAction,
    null
  );

  const available = lines.filter((l) => l.available);
  const [chosen, setChosen] = useState<Record<string, boolean>>(
    Object.fromEntries(available.map((l) => [l.skuCode, true]))
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(available.map((l) => [l.skuCode, l.qty]))
  );
  const [keepCart, setKeepCart] = useState(true);

  const tickedCount = available.filter((l) => chosen[l.skuCode]).length;
  const estimate = available
    .filter((l) => chosen[l.skuCode])
    .reduce((n, l) => n + (l.priceFils ?? 0) * (quantities[l.skuCode] ?? l.qty), 0);

  return (
    <form action={submit}>
      <ul className="space-y-2">
        {lines.map((line) => {
          const ticked = Boolean(chosen[line.skuCode]);
          return (
            <li
              key={line.skuCode}
              className={`flex flex-wrap items-center gap-3 rounded-card border p-3 ${
                line.available
                  ? "border-border-base bg-surface"
                  : "border-border-base bg-surface-sunken opacity-70"
              }`}
            >
              <input
                type="checkbox"
                checked={ticked}
                disabled={!line.available}
                onChange={(e) =>
                  setChosen((prev) => ({ ...prev, [line.skuCode]: e.target.checked }))
                }
                aria-label={`Include ${line.name}`}
                className="h-4 w-4 shrink-0 accent-[var(--color-navy,#212B5E)]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">{line.name}</p>
                <p className="text-xs tnum text-text-subtle">
                  {line.skuCode} &middot; {line.unitLabel}
                  {line.reason && (
                    <span className="ml-1.5 font-bold text-danger">
                      {line.reason}
                    </span>
                  )}
                </p>
              </div>

              {line.available ? (
                <>
                  <input
                    type="number"
                    min={1}
                    value={quantities[line.skuCode] ?? line.qty}
                    onChange={(e) =>
                      setQuantities((prev) => ({
                        ...prev,
                        [line.skuCode]: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    aria-label={`Quantity of ${line.name}`}
                    className="h-9 w-20 rounded-card border border-border-strong bg-surface px-2 text-right text-sm tnum text-text"
                  />
                  <span className="w-24 text-right text-sm font-bold tnum text-text">
                    {line.priceFils !== null
                      ? aed(line.priceFils * (quantities[line.skuCode] ?? line.qty))
                      : "—"}
                  </span>
                  {ticked && (
                    <>
                      <input type="hidden" name="skuCode" value={line.skuCode} />
                      <input
                        type="hidden"
                        name="qty"
                        value={quantities[line.skuCode] ?? line.qty}
                      />
                    </>
                  )}
                </>
              ) : (
                <span className="text-xs font-semibold text-text-subtle">
                  cannot be reordered
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* The cart question, asked rather than guessed. */}
      {cartCount > 0 && (
        <fieldset className="mt-5 rounded-card border border-accent-border bg-accent-soft p-4">
          <legend className="px-1 text-sm font-bold text-text">
            You already have {cartCount} {cartCount === 1 ? "item" : "items"} in
            your basket
          </legend>
          <div className="mt-1 space-y-2">
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="radio"
                name="keepCart"
                value="yes"
                checked={keepCart}
                onChange={() => setKeepCart(true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">Add this order to my basket</span>
                <span className="block text-xs text-text-muted">
                  Keeps what is already there and adds these lines to it.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="radio"
                name="keepCart"
                value="no"
                checked={!keepCart}
                onChange={() => setKeepCart(false)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">Start a fresh basket</span>
                <span className="block text-xs text-text-muted">
                  Empties the basket first, so you get only this order.
                </span>
              </span>
            </label>
          </div>
        </fieldset>
      )}
      {cartCount === 0 && <input type="hidden" name="keepCart" value="yes" />}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending || tickedCount === 0}
          className="h-11 rounded-card bg-brand px-6 font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {pending
            ? "Adding…"
            : `Add ${tickedCount} ${tickedCount === 1 ? "line" : "lines"} to basket`}
        </button>
        <span className="text-sm text-text-muted tnum">
          about {aed(estimate)} at today&rsquo;s prices
        </span>
        {state?.ok === false && state.error && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
