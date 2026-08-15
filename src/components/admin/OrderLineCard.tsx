"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { AdminForm, Field } from "@/components/AdminForm";
import { setLineBatchAction } from "@/app/admin/orders/[reference]/actions";
import { setLineStatusAction } from "@/app/admin/orders/bulk-actions";

/**
 * One order line, as a card.
 *
 * The reference UI put a status on every part because a print job is really N
 * independent jobs. The same is true here for a different reason: the lines of
 * one order can come from different suppliers and go out on different days, so
 * a line carries its own fulfilment state.
 *
 * The lot fields are the part that has no equivalent in the reference UI and
 * matters more than anything else on this card. A recall is answered by
 * looking up which order lines carried a batch — if it was never written down
 * at picking, that question has no answer.
 */
export function OrderLineCard({
  reference,
  item,
  statuses,
}: {
  reference: string;
  item: {
    id: string;
    name: string;
    skuCode: string;
    unitLabel: string;
    taxClass: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
    vat: string;
    status: string;
    batchCode: string | null;
    expiresOn: string | null;
    supplier: string;
    productHref: string | null;
    expiringSoon: boolean;
    expired: boolean;
  };
  statuses: readonly string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showLot, setShowLot] = useState(false);

  const changeStatus = (status: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setLineStatusAction(item.id, status, reference);
      if (!result.ok) setError(result.error ?? "That did not work.");
      router.refresh();
    });
  };

  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-text">
            {item.productHref ? (
              <Link href={item.productHref} className="hover:text-navy hover:underline">
                {item.name}
              </Link>
            ) : (
              item.name
            )}
          </p>
          <p className="mt-0.5 text-xs tnum text-text-subtle">
            {item.skuCode} &middot; {item.unitLabel} &middot; {item.supplier}
            {item.taxClass === "ZeroRated" && (
              <span className="ml-1 font-bold text-success">zero rated</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={item.status} />
          <select
            value={item.status}
            disabled={pending}
            aria-label={`Fulfilment status for ${item.skuCode}`}
            onChange={(e) => changeStatus(e.target.value)}
            className="rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none disabled:opacity-50"
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <Cell label="Quantity" value={String(item.qty)} />
        <Cell label="Unit price" value={item.unitPrice} />
        <Cell label="VAT" value={item.vat} />
        <Cell label="Line total" value={item.lineTotal} strong />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-base pt-3">
        {item.batchCode ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              item.expired
                ? "bg-danger-soft text-danger"
                : item.expiringSoon
                  ? "bg-accent-soft text-accent"
                  : "bg-surface-sunken text-text-muted"
            }`}
          >
            Lot {item.batchCode}
            {item.expiresOn ? ` · expires ${item.expiresOn}` : ""}
            {item.expired ? " · EXPIRED" : item.expiringSoon ? " · expiring" : ""}
          </span>
        ) : (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent">
            No lot recorded
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowLot((v) => !v)}
          className="text-xs font-bold text-navy hover:underline"
        >
          {showLot ? "Cancel" : item.batchCode ? "Change lot" : "Record lot"}
        </button>

        {error && (
          <p role="alert" className="text-xs font-semibold text-danger">
            {error}
          </p>
        )}
      </div>

      {showLot && (
        <AdminForm
          action={setLineBatchAction}
          submitLabel="Save lot"
          className="mt-3 max-w-lg"
        >
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="reference" value={reference} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Batch / lot code"
              name="batchCode"
              defaultValue={item.batchCode}
              hint="As printed on the carton that was picked."
            />
            <Field
              label="Expires on"
              name="expiresOn"
              type="date"
              defaultValue={item.expiresOn}
            />
          </div>
        </AdminForm>
      )}
    </li>
  );
}

function Cell({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className={`tnum ${strong ? "font-bold text-text" : "text-text-muted"}`}>
        {value}
      </dd>
    </div>
  );
}
