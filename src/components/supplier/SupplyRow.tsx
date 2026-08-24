"use client";

import { useActionState, useState } from "react";
import { updateSupplyAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";
import type { MySupply } from "@/lib/supplier-portal";
import {
  SUPPLY_STATES,
  SUPPLY_STATE_META,
  supplyStateMeta,
} from "@/lib/supply-state";

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
export function SupplyRow({
  supply,
  alternatives,
}: {
  supply: MySupply;
  /** Packs this supplier supplies, so a replacement can be named. */
  alternatives: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(updateSupplyAction, null);
  // Held here so the replacement picker can appear the moment "out of stock"
  // is chosen, rather than after a save.
  const [status, setStatus] = useState(supply.supplyStatus ?? "Available");
  const meta = supplyStateMeta(status);

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
        <div className="flex min-w-0 items-start gap-3">
          {/* A picture, because their part numbers rarely match ours and a
              wrong line marked discontinued takes a product off sale for no
              reason. Fixed size so forty rows stay a list rather than a
              gallery. */}
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-base bg-surface-sunken">
            {supply.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={supply.image}
                alt={supply.imageAlt ?? ""}
                width={48}
                height={48}
                className="h-full w-full object-contain"
              />
            ) : (
              <span aria-hidden="true" className="text-xs text-text-subtle">
                no photo
              </span>
            )}
          </span>
        <div className="min-w-0">
          <p className="font-bold text-text">{supply.productName}</p>
          <p className="mt-0.5 text-sm text-text-muted tnum">
            {supply.skuCode} &middot; {supply.unitLabel}
            {supply.supplierPartNumber
              ? ` · your ref ${supply.supplierPartNumber}`
              : ""}
          </p>
          {supply.alternative && (
            <p className="mt-1 text-sm text-text-muted">
              You suggested{" "}
              <span className="font-semibold text-text">
                {supply.alternative.label}
              </span>{" "}
              instead.
            </p>
          )}
        </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {/* No standing pill. Whether they are our primary or our backup on
              this item is ours, not theirs — see the note in listMySupplies,
              which no longer even asks the database for it. */}
          {!supply.isAvailable && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                supplyStateMeta(supply.supplyStatus).tone === "stopped"
                  ? "bg-danger-soft text-danger"
                  : "bg-accent-soft text-accent"
              }`}
            >
              {supplyStateMeta(supply.supplyStatus).label.toLowerCase()}
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

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Can you supply this?
            </span>
            <select
              name="supplyStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={field}
            >
              {SUPPLY_STATES.map((value) => (
                <option key={value} value={value}>
                  {SUPPLY_STATE_META[value].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-text-subtle">
              {meta.meaning}
              {!meta.canSupply
                ? " It does not affect anything else you supply."
                : ""}
            </span>
          </label>

          {/* Only when it would help. A replacement box on a line they can
              supply is a question with no answer. */}
          {meta.invitesAlternative && (
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-text-subtle">
                Is there something we should buy instead? (optional)
              </span>
              <select
                name="alternativeSkuId"
                defaultValue={supply.alternative?.id ?? ""}
                className={field}
              >
                <option value="">No suggestion</option>
                {alternatives.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-text-subtle">
                From what you supply. A suggestion for our buyer, nothing more
                — it does not change what gets ordered. If the replacement is
                something you do not supply, tell us in the usual way.
              </span>
            </label>
          )}

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
