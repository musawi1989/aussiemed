"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  removeFromMySupplyAction,
  updateSupplyAction,
} from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";
import type { MySupply } from "@/lib/supplier-portal";
import { supplyStateMeta } from "@/lib/supply-state";
import type { PermissionMap } from "@/lib/permission-catalogue";

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
  perms,
}: {
  supply: MySupply;
  /** Packs this supplier supplies, so a replacement can be named. */
  alternatives: { id: string; label: string }[];
  /** Set on admin Roles and permissions. Enforced again server-side. */
  perms: PermissionMap;
}) {
  const [open, setOpen] = useState(false);

  const canEditTerms = perms.editTerms !== "off";
  const canPrice = perms.changePrice !== "off";
  const canStock = perms.markOutOfStock !== "off";

  /*
   * No Edit button when the form behind it would be empty.
   *
   * Opening a panel to find nothing in it reads as a fault, and a supplier
   * cannot tell a permission they were never given from a page that is broken.
   */
  const canOpen = canEditTerms || canPrice || canStock;

  /*
   * Cover is never removable from their side — a rule rather than a
   * permission, and the reason is in supply-offers.ts. The button used to
   * render on every row and refuse on these, which is a worse way of saying
   * the same thing than not offering it.
   */
  const canRemove = perms.removeOffers !== "off" && supply.standing === null;
  const [state, submit, pending] = useActionState(updateSupplyAction, null);

  /*
   * Shut on a successful save.
   *
   * A supplier working down forty rows wants the one they have just finished
   * to get out of the way. It stays open on a refusal, because the message
   * explaining what was wrong is inside the form and closing it would hide
   * the answer along with the question.
   *
   * Keyed on the result rather than done inside the submit handler: the action
   * has to have come back before we know which of the two happened.
   */
  const savedRef = useRef<FormState>(null);
  useEffect(() => {
    if (state?.ok === true && state !== savedRef.current) {
      savedRef.current = state;
      setOpen(false);
    }
  }, [state]);
  // Held here so the replacement picker can appear the moment "out of stock"
  // is chosen, rather than after a save.
  /*
   * Narrowed to the two the toggle offers.
   *
   * The column still permits Discontinued, which nothing can set any more —
   * the dropdown that offered it is gone and the admin never had a control for
   * it. A row left on that value from before would highlight neither button
   * and then save whichever the supplier pressed, which is fine; folding it to
   * "out of stock" on open just means the row reads correctly while they look
   * at it.
   */
  const [status, setStatus] = useState(
    supply.supplyStatus === "Available" ? "Available" : "OutOfStock"
  );
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
          {/* Straight to the listing a buyer sees. It is a public page and
              reveals nothing they could not reach from the shop — but it is
              the fastest way for a supplier to check they are looking at the
              same pack we are. */}
          <p className="font-bold">
            <a
              href={`/products/${supply.productSlug}`}
              target="_blank"
              rel="noreferrer"
              className="text-text underline decoration-border-strong underline-offset-2 hover:text-navy hover:decoration-navy"
            >
              {supply.productName}
            </a>
          </p>
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
          {/* Where they stand on this line, at the client's request — see the
              note in listMySupplies. Primary reads as the confident one;
              Backup is stated plainly rather than softened, because a supplier
              who thinks they are first call and is not will price as though
              they were. */}
          {supply.standing && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                supply.standing === "Primary"
                  ? "bg-navy text-on-navy"
                  : "bg-surface-sunken text-text-muted"
              }`}
              title={
                supply.standing === "Primary"
                  ? "We come to you first for this item."
                  : "We come to you when the primary supplier cannot supply."
              }
            >
              {supply.standing === "Primary" ? "Primary" : "Backup"}
            </span>
          )}
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

          {/* Said on the row itself, not only inside the form. A supplier who
              cannot see that their new price is still waiting assumes it took
              effect, and invoices against it. */}
          {supply.proposedCostFils !== null && (
            <span
              className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent"
              title="Sent to AussieMed. The price shown still applies until it is agreed."
            >
              AED {(supply.proposedCostFils / 100).toFixed(2)} awaiting approval
            </span>
          )}

          {!open && canOpen && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Edit
            </button>
          )}

          {/* Beside Edit, where the two things you can do to a row belong
              together. It asks before it acts, which is what keeps it safe
              sitting next to the button somebody actually meant to press. */}
          {canRemove && (
            <RemoveSupply id={supply.id} name={supply.productName} />
          )}
        </div>
      </div>

      {open && (
        <form action={submit} className="mt-3 border-t border-border-base pt-3">
          <input type="hidden" name="supplyId" value={supply.id} />

          <div className="grid gap-3 sm:grid-cols-3">
            {canEditTerms && (
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
            )}

            {canPrice && (
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
              {/* Said plainly at the point of typing. A price is the one field
                  on this form that does not take effect on save, and finding
                  that out afterwards is how an invoice goes out at the wrong
                  figure. */}
              <span className="mt-1 block text-[11px] text-text-subtle">
                {perms.changePrice === "approval"
                  ? "A change here is sent to AussieMed for approval. The current price applies until it is agreed."
                  : "A change here takes effect straight away, and applies to your next purchase order."}
              </span>
            </label>
            )}

            {canEditTerms && (
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
            )}
          </div>

          {/*
            In stock, or not. Two states, not three.

            This was a dropdown asking "Can you supply this?" with Available,
            Out of stock and Discontinued. The question a supplier actually
            answers week to week is the first one, and asking it as a sentence
            made a two-second job feel like a form. Discontinued is now the
            Remove button on the row above: a line they no longer carry is one
            they take off their list, not a state they park it in.
          */}
          {canStock && (
          <div className="mt-3">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Stock
            </span>
            <input type="hidden" name="supplyStatus" value={status} />
            <div className="inline-flex rounded-card border border-border-strong bg-surface p-0.5">
              {[
                { value: "Available", label: "In stock" },
                { value: "OutOfStock", label: "Out of stock" },
              ].map((option) => {
                const on = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    aria-pressed={on}
                    className={`rounded-card px-4 py-1.5 text-sm font-bold transition-colors ${
                      on
                        ? option.value === "Available"
                          ? "bg-success text-white"
                          : "bg-accent text-surface"
                        : "text-text-muted hover:text-text"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="mt-1 block text-xs text-text-subtle">
              {meta.meaning}
            </span>
          </div>
          )}

          {/* Only when it would help. A replacement box on a line they can
              supply is a question with no answer. */}
          {canStock && perms.suggestAlternative !== "off" && meta.invitesAlternative && (
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

/** One button, one intent, its own pending state and its own error. */
function RemoveSupply({ id, name }: { id: string; name: string }) {
  const [state, submit, pending] = useActionState(removeFromMySupplyAction, null);

  return (
    <form action={submit}>
      <input type="hidden" name="supplyId" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          if (
            !window.confirm(
              `Remove ${name} from your list?

` +
                "AussieMed will stop ordering it from you. You can add it back at any time."
            )
          ) {
            event.preventDefault();
          }
        }}
        className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-surface-hover disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      <Feedback state={state} />
    </form>
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
