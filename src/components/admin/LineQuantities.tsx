"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import { setLineQuantitiesAction } from "@/app/admin/purchasing/actions";
import type { FormState } from "@/components/AdminForm";

type Line = {
  id: string;
  name: string;
  skuCode: string;
  supplierPartNumber: string | null;
  qtyOrdered: number;
  qtyConfirmed: number | null;
};

/**
 * Recording what a supplier told us, from our side of the desk.
 *
 * THE GAP THIS FILLS. A supplier can say "eight of the ten" in their own
 * portal, and most of them do not — they ring up, reply to the order email, or
 * tell the driver. That answer had nowhere to go: only the supplier's own hands
 * could move qtyConfirmed, so a phone call stayed a phone call while the buying
 * run went on believing all ten were coming, and the shortfall was discovered
 * when the delivery arrived short.
 *
 * BLANK IS NOT ZERO, and the form says so rather than assuming everybody
 * remembers. Blank means they have not said, which is a chase; zero means none
 * of these, stop waiting. Back orders only counts the second, so the difference
 * decides whether the demand gets re-sourced today or sits.
 *
 * WHAT WE ASKED FOR IS ONLY EDITABLE ON A DRAFT. Once an order has been sent it
 * is a document the supplier is working from, and changing what it says we
 * asked for destroys the only evidence of what they were actually asked to
 * supply. The inputs are simply not rendered after that — the service refuses
 * either way, but a box you can type in and cannot save is worse than no box.
 */
export function LineQuantities({
  purchaseOrderId,
  poNumber,
  lines,
  ordersEditable,
}: {
  purchaseOrderId: string;
  poNumber: string;
  lines: Line[];
  /** True only while the order is a draft. */
  ordersEditable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(setLineQuantitiesAction, null);

  const unanswered = lines.filter((line) => line.qtyConfirmed === null).length;
  const short = lines.filter(
    (line) => line.qtyConfirmed !== null && line.qtyConfirmed < line.qtyOrdered
  ).length;

  if (!open) {
    return (
      <div className="mt-5 border-t border-border-base pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-text">
            What they can send
          </h3>
          <p className="text-xs tnum text-text-muted">
            {unanswered > 0
              ? `${unanswered} line${unanswered === 1 ? "" : "s"} unanswered`
              : "every line answered"}
            {short > 0 && ` · ${short} short`}
          </p>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Suppliers can confirm quantities in their own portal. When one tells
          you on the phone instead, write it down here so the buying run and
          Back orders both see it.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Record what they said
        </button>
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <RestoringForm state={state} saveAll={true} action={submit} className="mt-5 border-t border-border-base pt-4">
      <input type="hidden" name="id" value={purchaseOrderId} />
      <input type="hidden" name="poNumber" value={poNumber} />
      {ordersEditable && <input type="hidden" name="ordersEditable" value="1" />}

      <h3 className="text-sm font-bold text-text">What they can send</h3>
      <p className="mt-1 text-xs text-text-muted">
        <span className="font-bold">Leave a box blank</span> to mean they have
        not said — that is a chase.{" "}
        <span className="font-bold">Enter 0</span> to mean none of these are
        coming, which is what puts the line on Back orders.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
              <th scope="col" className="py-1.5 pr-3 font-bold">Item</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                {ordersEditable ? "We ask for" : "We asked for"}
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                They confirm
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border-base last:border-0">
                <td className="py-1.5 pr-3">
                  <span className="block font-semibold text-text">{line.name}</span>
                  <span className="block text-xs tnum text-text-subtle">
                    {line.supplierPartNumber ?? line.skuCode}
                  </span>
                  <input type="hidden" name="lineId" value={line.id} />
                </td>
                <td className="py-1.5 pr-3 text-right">
                  {ordersEditable ? (
                    <input
                      name="qtyOrdered"
                      type="number"
                      min={1}
                      defaultValue={line.qtyOrdered}
                      aria-label={`Quantity ordered of ${line.name}`}
                      className="w-20 rounded-card border border-border-strong bg-surface px-2 py-1 text-right text-sm tnum text-text focus:border-navy focus:outline-none"
                    />
                  ) : (
                    <span className="tnum text-text-muted">{line.qtyOrdered}</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <input
                    name="qtyConfirmed"
                    type="number"
                    min={0}
                    max={line.qtyOrdered}
                    defaultValue={line.qtyConfirmed ?? ""}
                    placeholder="not said"
                    aria-label={`Quantity confirmed of ${line.name}`}
                    className="w-24 rounded-card border border-border-strong bg-surface px-2 py-1 text-right text-sm tnum text-text focus:border-navy focus:outline-none"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Who told you, and how <span className="font-normal">(kept on the audit trail)</span>
        </span>
        <input
          name="note"
          placeholder="Rang Samir at Chemist Warehouse, 31 Aug — two boxes short until Thursday."
          className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save quantities"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-text-muted hover:underline"
        >
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </RestoringForm>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="mt-1 text-xs font-semibold text-success">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}
