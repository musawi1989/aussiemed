"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useRef, useState } from "react";
import { addSupplierItemAction } from "@/app/admin/suppliers/[id]/item-actions";
import type { FormState } from "@/components/AdminForm";

export type PackOption = {
  skuId: string;
  skuCode: string;
  name: string;
  unitLabel: string;
  categoryName: string | null;
  image: string | null;
  imageAlt: string | null;
  alreadyTheirs: boolean;
};

/**
 * Adding packs to a supplier, one price-list line at a time.
 *
 * SEARCH IS A LINK, NOT STATE. Typing narrows the list by reloading the page
 * with ?items=, which means the browser back button works, the result can be
 * sent to somebody, and a mis-click does not lose what was typed. The
 * alternative — holding results in the component — re-fetches on every
 * keystroke and forgets everything on a refresh.
 *
 * COST AND PART NUMBER ARE ON EACH ROW rather than in a dialog. Somebody doing
 * this has a price list open beside them and is copying two fields per line;
 * a modal per item turns forty entries into a hundred and twenty clicks.
 */
export function AddSupplierItems({
  supplierId,
  packs,
  query,
  total,
}: {
  supplierId: string;
  packs: PackOption[];
  query: string;
  /** How many are on their list already, for the heading. */
  total: number;
}) {
  const [open, setOpen] = useState(query.length > 0);

  if (!open) {
    return (
      <div className="mt-3 border-t border-border-base pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
        >
          Add items
        </button>
        <p className="mt-2 text-xs leading-relaxed text-text-subtle">
          Records what this supplier can send us. It does not decide who we buy
          each pack from — that is{" "}
          <a
            href="/admin/suppliers/cover"
            className="font-semibold underline hover:no-underline"
          >
            Cover
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border-base pt-3">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
            Find a pack
          </span>
          <input
            name="items"
            defaultValue={query}
            placeholder="Product name"
            className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-[38px] rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
        >
          Search
        </button>
        {query && (
          <a
            href="?"
            className="h-[38px] rounded-card px-2 text-sm font-semibold leading-[38px] text-text-muted hover:text-navy"
          >
            Clear
          </a>
        )}
      </form>

      <p className="mt-2 text-xs text-text-subtle">
        {query
          ? `${packs.length} match${packs.length === 1 ? "" : "es"}${packs.length === 60 ? " — showing the first 60, narrow it further" : ""}.`
          : `Showing the first ${packs.length}. Search to find a specific pack.`}{" "}
        Adding records what they can send; it does not decide who we buy from.
      </p>

      {packs.length === 0 ? (
        <p className="mt-3 rounded-card border border-border-base px-3 py-6 text-center text-sm text-text-muted">
          Nothing on sale matches that.
        </p>
      ) : (
        <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto pr-1">
          {packs.map((pack) => (
            <PackRow key={pack.skuId} supplierId={supplierId} pack={pack} />
          ))}
        </ul>
      )}

      <p className="mt-3 text-xs text-text-subtle tnum">
        {total} pack{total === 1 ? "" : "s"} on their list.
      </p>
    </div>
  );
}

/** Its own form and its own state, so one row's error stays on that row. */
function PackRow({
  supplierId,
  pack,
}: {
  supplierId: string;
  pack: PackOption;
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    addSupplierItemAction,
    null
  );
  const form = useRef<HTMLFormElement>(null);

  // The row is kept and marked once added, rather than vanishing: Next
  // re-renders after the action, and a row that disappears takes its own
  // confirmation with it.
  const theirs = pack.alreadyTheirs || state?.ok === true;

  return (
    <li className="rounded-card border border-border-base px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-card border border-border-base bg-surface-sunken">
          {pack.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pack.image}
              alt={pack.imageAlt ?? ""}
              width={36}
              height={36}
              className="h-full w-full object-contain"
            />
          ) : (
            <span aria-hidden="true" className="text-[9px] text-text-subtle">
              no photo
            </span>
          )}
        </span>

        <span className="min-w-[10rem] flex-1">
          <span className="block text-sm font-semibold text-text">
            {pack.name}
          </span>
          <span className="block text-xs text-text-muted tnum">
            {pack.skuCode} &middot; {pack.unitLabel}
            {pack.categoryName ? ` · ${pack.categoryName}` : ""}
          </span>
        </span>

        {theirs ? (
          <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-bold text-text-muted">
            On their list
          </span>
        ) : (
          <RestoringForm state={state} saveAll={true} ref={form} action={submit} className="flex flex-wrap items-center gap-1.5">
            <input type="hidden" name="supplierId" value={supplierId} />
            <input type="hidden" name="skuId" value={pack.skuId} />
            <input
              name="supplierPartNumber"
              placeholder="Their code"
              aria-label={`Their code for ${pack.skuCode}`}
              className="h-8 w-28 rounded-card border border-border-strong bg-surface px-2 text-sm text-text focus:border-navy focus:outline-none"
            />
            <input
              name="costAED"
              inputMode="decimal"
              placeholder="Cost"
              aria-label={`What we pay for ${pack.skuCode}`}
              className="h-8 w-20 rounded-card border border-border-strong bg-surface px-2 text-sm tnum text-text focus:border-navy focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving}
              className="h-8 rounded-card bg-navy px-3 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </RestoringForm>
        )}
      </div>

      {state?.ok === false && (
        <p role="alert" className="mt-1 text-xs font-semibold text-danger">
          {state.error}
        </p>
      )}
    </li>
  );
}
