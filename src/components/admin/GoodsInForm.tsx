"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useEffect, useState } from "react";
import { receiveAction } from "@/app/admin/purchasing/actions";
import type { FormState } from "@/components/AdminForm";

export type ReceivableLine = {
  id: string;
  name: string;
  skuCode: string;
  supplierPartNumber: string | null;
  qtyOrdered: number;
  qtyReceived: number;
};

/**
 * Booking a delivery in — BE-37.
 *
 * Each line defaults to the quantity still outstanding, because that is what
 * usually turns up and a form that makes the common case one click is a form
 * people use honestly. Recording less is the point of the field; recording more
 * is refused, so an over-delivery becomes a conversation rather than a silent
 * adjustment.
 *
 * Batch and expiry are per line, not per delivery: a supplier can easily send
 * two products from different lots in one box, and a recall answered with the
 * wrong lot is worse than one answered with none.
 */
export function GoodsInForm({
  purchaseOrderId,
  poNumber,
  lines,
}: {
  purchaseOrderId: string;
  poNumber: string;
  lines: ReceivableLine[];
}) {
  const [state, submit, pending] = useActionState(receiveAction, null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  useEffect(() => { if (state?.ok) setRequestKey(crypto.randomUUID()); }, [state]);

  const outstanding = lines.filter((l) => l.qtyReceived < l.qtyOrdered);

  if (outstanding.length === 0) {
    return (
      <p className="mt-3 rounded-card bg-surface-sunken px-4 py-3 text-sm text-text-muted">
        Everything on this order has been received.
      </p>
    );
  }

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="mt-3">
      <input type="hidden" name="id" value={purchaseOrderId} />
      <input type="hidden" name="requestKey" value={requestKey} />
      <input type="hidden" name="poNumber" value={poNumber} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
            <tr>
              <th className="py-1.5">Item</th>
              <th className="py-1.5 text-right">Outstanding</th>
              <th className="py-1.5 text-right">Received now</th>
              <th className="py-1.5">Batch</th>
              <th className="py-1.5">Expires</th>
            </tr>
          </thead>
          <tbody>
            {outstanding.map((line) => {
              const remaining = line.qtyOrdered - line.qtyReceived;
              return (
                <tr key={line.id} className="border-b border-border-base last:border-0">
                  <td className="py-2 align-top">
                    <span className="block text-text">{line.name}</span>
                    <span className="block text-xs text-text-subtle tnum">
                      {line.supplierPartNumber ?? line.skuCode}
                    </span>
                    <input type="hidden" name="lineId" value={line.id} />
                  </td>
                  <td className="py-2 text-right align-top tnum text-text-muted">
                    {remaining}
                    {line.qtyReceived > 0 && (
                      <span className="block text-xs text-text-subtle">
                        {line.qtyReceived} already in
                      </span>
                    )}
                  </td>
                  <td className="py-2 align-top">
                    <input
                      type="number"
                      name="qtyReceived"
                      min={0}
                      max={remaining}
                      key={remaining}
                      defaultValue={0}
                      aria-label={`Received of ${line.name}`}
                      className="h-9 w-20 rounded-card border border-border-strong bg-surface px-2 text-right text-sm tnum text-text"
                    />
                  </td>
                  <td className="py-2 align-top">
                    <input
                      name="batchCode"
                      placeholder="Lot number"
                      aria-label={`Batch for ${line.name}`}
                      className="h-9 w-32 rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
                    />
                  </td>
                  <td className="py-2 align-top">
                    <input
                      type="date"
                      name="expiresOn"
                      aria-label={`Expiry for ${line.name}`}
                      className="h-9 rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text-subtle">
        Received goods await allocation under Sales, Received products.
        Undelivered quantities remain outstanding on this purchase order.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-red px-4 py-2 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {pending ? "Booking in…" : "Book in delivery"}
        </button>
        {state?.ok === false && state.error && (
          <span role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </span>
        )}
        {state?.ok === true && (
          <span role="status" className="text-sm font-semibold text-success">
            {state.message}
          </span>
        )}
      </div>
    </RestoringForm>
  );
}
