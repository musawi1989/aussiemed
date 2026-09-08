"use client";

import { Fragment, useActionState, useState } from "react";
import {
  removeAgreedPriceAction,
  setAgreedPriceAction,
} from "@/app/admin/customers/terms-actions";
import {
  Panel,
  RestoringForm,
  useRestored,
  type FormState,
} from "@/components/AdminForm";
import { formatAED } from "@/lib/money";
import type { AgreedPriceRow } from "@/lib/customer-admin";
import { ConfirmSubmit } from "./ConfirmSubmit";

const aed = (fils: number) => formatAED(fils / 100);

const INPUT_BASE =
  "w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";

/**
 * A field that keeps what was typed when the form is refused.
 *
 * "No item has the code X" is the common refusal here, and it would
 * otherwise take the price and the note down with it — so correcting one
 * character in a code would mean retyping the whole line.
 */
function PriceField({
  name,
  placeholder,
  defaultValue,
  numeric = false,
}: {
  name: string;
  placeholder?: string;
  /** The stored value, for the edit form. Absent when adding. */
  defaultValue?: string;
  numeric?: boolean;
}) {
  // What was typed beats what was stored: after a refusal the person is
  // correcting their own entry, not starting again from the saved row.
  const restored = useRestored(name);
  return (
    <input
      name={name}
      defaultValue={restored ?? defaultValue ?? ""}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      className={numeric ? INPUT_BASE + " tnum" : INPUT_BASE}
    />
  );
}

/** Fils back to something the price box can be filled with. */
const asAmount = (fils: number) => (fils / 100).toFixed(2);

/**
 * Prices agreed with this account for particular items.
 *
 * AN AGREED PRICE IS FINAL. It beats list, it beats volume breaks, and the
 * account discount does NOT come off it again — a buyer who negotiated a price
 * and then found another 2.5% coming off would be right to ask which figure we
 * meant. The rule lives in pricing.ts with tests; this screen states it so
 * nobody has to go and read them.
 *
 * The list shows what everybody else pays beside what they pay, because the
 * question asked of this screen is never "what is their price" on its own —
 * it is "is this still worth honouring".
 */
export function AgreedPrices({
  id,
  prices,
  discountBasisPoints,
}: {
  id: string;
  prices: AgreedPriceRow[];
  discountBasisPoints: number;
}) {
  const [addState, add, adding] = useActionState<FormState, FormData>(
    setAgreedPriceAction,
    null,
  );
  /*
   * Editing goes through the same action as adding.
   *
   * setAgreedPrice is an upsert keyed on the account and the SKU, so changing
   * a price and agreeing one for the first time are the same operation with
   * the same rules. A separate edit action would be a second copy of the
   * validation, free to drift from the first.
   */
  const [editState, edit, editing] = useActionState<FormState, FormData>(
    setAgreedPriceAction,
    null,
  );
  const [removeState, remove, removing] = useActionState<FormState, FormData>(
    removeAgreedPriceAction,
    null,
  );

  // One row open at a time. Nothing is open to begin with: a list of six
  // agreed prices should read as six prices, not as six forms.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Panel
      title={`Agreed prices (${prices.length})`}
      note="A price agreed for one item, for this account only. It overrides list and volume breaks, and the account discount does not apply on top of it."
    >
      {prices.length === 0 ? (
        <p className="rounded-card bg-surface-sunken px-3 py-3 text-sm text-text-muted">
          None. This account pays list
          {discountBasisPoints > 0 ? " less its account discount" : ""} on
          everything.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border-base">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2 text-right">List</th>
                <th className="px-3 py-2 text-right">They pay</th>
                <th className="px-3 py-2">Why</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {prices.map((row) => {
                // Shown because it is the question somebody is really asking.
                // An agreed price ABOVE list is not necessarily wrong — list
                // may have fallen since — but it is always worth a look.
                const above = row.priceFils > row.listPriceFils;
                const open = openId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={
                        open
                          ? "border-b border-border-base"
                          : "border-b border-border-base last:border-0"
                      }
                    >
                      <td className="px-3 py-2 font-semibold text-text">
                        {row.productName}
                        <span className="ml-1 text-xs font-normal text-text-subtle">
                          {row.unitLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 tnum text-text-muted">
                        {row.skuCode}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tnum text-text-muted">
                        {aed(row.listPriceFils)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-bold tnum text-text">
                        {aed(row.priceFils)}
                        {above && (
                          <span
                            className="ml-1 text-[11px] font-bold text-attention-text"
                            title="This is more than the current list price. List may have fallen since it was agreed."
                          >
                            above list
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {row.note ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <span className="inline-flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenId(openId === row.id ? null : row.id)
                            }
                            className="cursor-pointer text-xs font-bold text-navy hover:underline"
                          >
                            {openId === row.id ? "Close" : "Edit"}
                          </button>

                          {/* Its own form, so a mis-click on Remove cannot be
                            the thing that saves an edit. */}
                          <RestoringForm state={removeState} saveAll={false} action={remove} className="inline">
                            <input type="hidden" name="id" value={id} />
                            <input
                              type="hidden"
                              name="priceId"
                              value={row.id}
                            />
                            <ConfirmSubmit
                              what="this agreed price"
                              consequence="The customer goes back to list price on this item. What was negotiated is not recorded anywhere else."
                              pending={removing}
                              pendingLabel="Removing…"
                              className="cursor-pointer text-xs font-bold text-danger hover:underline disabled:opacity-60"
                            />
                          </RestoringForm>
                        </span>
                      </td>
                    </tr>

                    {open && (
                      <tr className="border-b border-border-base last:border-0">
                        {/* Across the whole table rather than inside the price
                          cell: the boxes want room, and a form squeezed into
                          one narrow column is a form nobody can read. */}
                        <td colSpan={6} className="bg-surface-sunken px-3 py-3">
                          <RestoringForm action={edit} state={editState}>
                            <input type="hidden" name="id" value={id} />
                            {/* The item is not editable here. Changing which
                              product a price belongs to is not an edit, it is
                              a different agreement — remove this one and
                              agree the other. */}
                            <input
                              type="hidden"
                              name="skuCode"
                              value={row.skuCode}
                            />

                            <div className="flex flex-wrap items-end gap-3">
                              <label className="block">
                                <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
                                  Agreed price
                                </span>
                                <span className="mt-1 flex w-40 items-center gap-1.5">
                                  <span className="shrink-0 text-xs font-bold text-text-muted">
                                    AED
                                  </span>
                                  <PriceField
                                    name="price"
                                    defaultValue={asAmount(row.priceFils)}
                                    numeric
                                  />
                                </span>
                              </label>

                              <label className="block min-w-[12rem] flex-1">
                                <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
                                  Why (optional)
                                </span>
                                <span className="mt-1 block">
                                  <PriceField
                                    name="note"
                                    placeholder="Tender 2026"
                                    defaultValue={row.note ?? ""}
                                  />
                                </span>
                              </label>

                              <button
                                type="submit"
                                disabled={editing}
                                className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
                              >
                                {editing ? "Saving…" : "Save price"}
                              </button>
                            </div>

                            <p className="mt-2 text-xs text-text-subtle">
                              {row.productName} &middot;{" "}
                              <span className="tnum">{row.skuCode}</span>{" "}
                              &middot; list {aed(row.listPriceFils)}. Changing
                              this does not reprice anything already ordered.
                            </p>

                            {editState?.ok === false && editState.error && (
                              <p
                                role="alert"
                                className="mt-2 text-xs font-semibold text-danger"
                              >
                                {editState.error}
                              </p>
                            )}
                            {editState?.ok === true && editState.message && (
                              <p
                                role="status"
                                className="mt-2 text-xs font-semibold text-success"
                              >
                                {editState.message}
                              </p>
                            )}
                          </RestoringForm>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {removeState?.ok === false && removeState.error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {removeState.error}
        </p>
      )}

      {/* Keyed on our SKU code rather than a product picker: whoever is
          entering a negotiated price list is reading it off a document with
          codes on it, and a searchable dropdown for two hundred items is
          slower than typing the code they are looking at. An unknown code is
          refused by name, so a typo says so. */}
      <RestoringForm
        action={add}
        state={addState}
        className="mt-4 border-t border-border-base pt-4"
      >
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-end">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Item code
            </span>
            <span className="mt-1 block">
              <PriceField name="skuCode" placeholder="BDC-FAK126" numeric />
            </span>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Agreed price
            </span>
            <span className="mt-1 flex items-center gap-1.5">
              <span className="shrink-0 text-xs font-bold text-text-muted">
                AED
              </span>
              <PriceField name="price" placeholder="0.00" numeric />
            </span>
          </label>

          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Why (optional)
            </span>
            <span className="mt-1 block">
              <PriceField name="note" placeholder="Tender 2026" />
            </span>
          </label>

          <button
            type="submit"
            disabled={adding}
            className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
          >
            {adding ? "Saving…" : "Agree"}
          </button>
        </div>

        <p className="mt-2 text-xs text-text-subtle">
          Entering a code that already has an agreed price changes it. Enter{" "}
          <span className="tnum font-semibold">0</span> for an item supplied
          free.
        </p>

        {addState?.ok === false && addState.error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-danger">
            {addState.error}
          </p>
        )}
        {addState?.ok === true && addState.message && (
          <p role="status" className="mt-2 text-xs font-semibold text-success">
            {addState.message}
          </p>
        )}
      </RestoringForm>
    </Panel>
  );
}
