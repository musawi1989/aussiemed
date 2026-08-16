"use client";

import { useActionState, useState } from "react";
import { updateSupplyAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";
import type { MySupply } from "@/lib/supplier-portal";

const field =
  "h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text";

/**
 * One pack a supplier supplies, with their own terms editable in place.
 *
 * Nothing on this row is ours: their code, their price to us, their lead time,
 * whether they can supply it. What AussieMed sells it for is not fetched, so
 * it cannot appear here by accident — see listMySupplies.
 *
 * The form opens on demand rather than rendering forty live forms at once,
 * which is both faster and harder to mis-click.
 */
export function SupplyRow({ supply }: { supply: MySupply }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(updateSupplyAction, null);

  const back = (key: string, fallback: string) =>
    (state?.ok === false ? state.values?.[key] : undefined) ?? fallback;

  const cost =
    supply.costFils === null ? "" : (supply.costFils / 100).toFixed(2);

  return (
    <li
      className={`rounded-card border bg-surface p-4 shadow-card ${
        supply.isAvailable ? "border-border-base" : "border-accent-border"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-text">{supply.productName}</p>
          <p className="mt-0.5 text-sm text-text-muted tnum">
            {supply.skuCode} &middot; {supply.unitLabel}
            {supply.supplierPartNumber
              ? ` · your ref ${supply.supplierPartNumber}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {/* Their standing, because it explains a quiet month: a backup only
              receives orders when the primary cannot supply. */}
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              supply.rank === "Primary"
                ? "bg-navy-soft text-navy"
                : "bg-surface-sunken text-text-muted"
            }`}
          >
            {supply.rank}
          </span>

          {!supply.isAvailable && (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
              you cannot supply this
            </span>
          )}
          {!supply.listed && (
            <span
              className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-bold text-text-muted"
              title="Not currently listed for sale, so nothing will be ordered"
            >
              not listed
            </span>
          )}

          <span className="font-bold tnum text-text">
            {supply.costFils === null ? (
              <span className="text-text-subtle">no price yet</span>
            ) : (
              `AED ${cost}`
            )}
          </span>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {open && (
        <form action={submit} className="mt-3 border-t border-border-base pt-3">
          <input type="hidden" name="supplyId" value={supply.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Your part number
              </span>
              <input
                name="supplierPartNumber"
                defaultValue={back("supplierPartNumber", supply.supplierPartNumber ?? "")}
                placeholder="Your own code"
                className={field}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Your price (AED)
              </span>
              <input
                name="costAED"
                inputMode="decimal"
                defaultValue={back("costAED", cost)}
                placeholder="12.34"
                className={field}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Lead time (days)
              </span>
              <input
                name="leadTimeDays"
                inputMode="numeric"
                defaultValue={back(
                  "leadTimeDays",
                  supply.leadTimeDays === null ? "" : String(supply.leadTimeDays)
                )}
                placeholder="Leave blank for your usual"
                className={field}
              />
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              name="isAvailable"
              value="yes"
              defaultChecked={supply.isAvailable}
              className="h-4 w-4"
            />
            I can supply this item
          </label>
          <p className="mt-1 text-xs text-text-subtle">
            Unticking it sends this item to the other supplier until you tick it
            again. It does not affect anything else you supply.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Close
            </button>
            <Feedback state={state} />
          </div>
        </form>
      )}
    </li>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <span role="alert" className="text-sm font-semibold text-danger">
        {state.error}
      </span>
    );
  }
  if (state?.ok === true) {
    return (
      <span role="status" className="text-sm font-semibold text-success">
        {state.message}
      </span>
    );
  }
  return null;
}
