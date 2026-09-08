"use client";
import { ProductThumbnail } from "@/components/ProductThumbnail";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { resourceBackordersAction } from "@/app/admin/purchasing/actions";
import type { FormState } from "@/components/AdminForm";

export type BackorderView = {
  lineId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  skuCode: string;
  name: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
  shortfall: number;
  /** Who is waiting on it, most affected first. */
  customers: {
    reference: string;
    organisation: string;
    qty: number;
    atRisk: number;
  }[];
  /** Missing units with no customer order behind them. */
  unallocatedShortfall: number;
};

/**
 * Everything a supplier said they cannot send, and the way to buy it elsewhere.
 *
 * Grouped by order rather than listed flat: what a supplier could not do is a
 * fact about a particular order, and somebody deciding whether to re-source is
 * looking at that order's whole picture.
 *
 * ONE NEW ORDER PER PRESS, not one per line. The button raises a single draft
 * to the chosen supplier for everything ticked, because that is the order a
 * buyer would actually place — three lines to one company is one phone call,
 * not three.
 *
 * The tick-boxes carry the SUPPLIER too, so the bar can refuse to send a line
 * back to the company that just declined it. That is a mistake worth catching
 * on the screen rather than in the server's reply.
 */
export function BackorderTable({
  lines,
  suppliers,
}: {
  lines: BackorderView[];
  suppliers: { id: string; name: string }[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [state, submit, pending] = useActionState<FormState, FormData>(
    resourceBackordersAction,
    null
  );

  const byId = useMemo(
    () => new Map(lines.map((l) => [l.lineId, l])),
    [lines]
  );

  const selected = [...ticked].map((id) => byId.get(id)).filter(Boolean) as BackorderView[];
  const units = selected.reduce((n, l) => n + l.shortfall, 0);

  // The suppliers already declining one of the ticked lines. Offering them
  // again is the one obviously wrong answer on this screen.
  const declining = new Set(selected.map((l) => l.supplierId));

  const toggle = (lineId: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

  const groups = new Map<string, BackorderView[]>();
  for (const line of lines) {
    const list = groups.get(line.poNumber) ?? [];
    list.push(line);
    groups.set(line.poNumber, list);
  }

  if (lines.length === 0) {
    return (
      <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
        Nothing outstanding. Every line a supplier has answered, they can supply
        in full.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {selected.length > 0 && (
        <RestoringForm state={state} saveAll={false} action={submit} className="rounded-card border border-navy-border bg-navy-soft p-3">
          {selected.map((line) => (
            <input key={line.lineId} type="hidden" name="lineId" value={line.lineId} />
          ))}

          <div className="flex flex-wrap items-end gap-2">
            <span className="mr-1 text-sm font-bold tnum text-navy">
              {units} {units === 1 ? "unit" : "units"} across {selected.length}{" "}
              {selected.length === 1 ? "line" : "lines"}
            </span>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text">
                Order these from
              </span>
              <select
                name="supplierId"
                defaultValue=""
                required
                className="h-9 cursor-pointer rounded-card border border-border-strong bg-surface px-2 text-sm text-text"
              >
                <option value="">Choose a supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id} disabled={declining.has(s.id)}>
                    {s.name}
                    {declining.has(s.id) ? " — already declined one of these" : ""}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={pending}
              className="h-9 cursor-pointer rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {pending ? "Raising…" : "Raise a draft order"}
            </button>

            <button
              type="button"
              onClick={() => setTicked(new Set())}
              className="h-9 cursor-pointer px-2 text-sm font-semibold text-text-muted hover:text-navy"
            >
              Clear
            </button>
          </div>

          {state?.ok === false && state.error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-danger">
              {state.error}
            </p>
          )}
          {state?.ok === true && state.message && (
            <p role="status" className="mt-2 text-xs font-semibold text-success">
              {state.message}
            </p>
          )}
        </RestoringForm>
      )}

      <div className="mt-3 space-y-4">
        {[...groups.entries()].map(([poNumber, group]) => (
          <div
            key={poNumber}
            className="overflow-hidden rounded-card border border-border-base bg-surface shadow-card"
          >
            <div className="flex flex-wrap items-baseline gap-2 border-b border-border-base px-3 py-2">
              <Link
                href={`/admin/purchasing/${poNumber}`}
                className="text-sm font-bold tnum text-navy hover:underline"
              >
                {poNumber}
              </Link>
              <span className="text-sm text-text-muted">
                {group[0]!.supplierName}
              </span>
              <span className="ml-auto text-xs font-semibold tnum text-accent">
                {group.reduce((n, l) => n + l.shortfall, 0)} short
              </span>
            </div>

            <table className="w-full border-collapse text-sm">
              <tbody>
                {group.map((line) => (
                  <tr
                    key={line.lineId}
                    className={`border-b border-border-base last:border-0 ${
                      ticked.has(line.lineId) ? "bg-navy-soft" : ""
                    }`}
                  >
                    <td className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={ticked.has(line.lineId)}
                        onChange={() => toggle(line.lineId)}
                        aria-label={`Select ${line.name}`}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <ProductThumbnail skuCode={line.skuCode} /><span className="block font-semibold text-text">{line.name}</span>
                      <span className="block text-xs tnum text-text-subtle">
                        {line.skuCode}
                      </span>

                      {/*
                        Who is actually waiting on it.

                        A back order is only interesting because somebody is
                        owed something, and that half used to be invisible: the
                        row said "eight of the ten cannot come" and left working
                        out whose eight to a person opening orders one at a
                        time. Deciding whether to re-source, and how urgently,
                        is a question about the customer at the end of it.

                        THE AT-RISK NUMBER, NOT THE ALLOCATED ONE, is what the
                        row leads with. A line allocated 20 to an account with a
                        shortfall of 3 is not 20 units of bad news, and showing
                        the larger figure would overstate the damage on every
                        line a supplier can mostly fill.
                      */}
                      {line.customers.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {line.customers.map((customer) => (
                            <li
                              key={customer.reference}
                              className="text-xs text-text-muted"
                            >
                              <span
                                className={`font-bold tnum ${
                                  customer.atRisk > 0 ? "text-accent" : "text-text-subtle"
                                }`}
                              >
                                {customer.atRisk > 0
                                  ? `${customer.atRisk} short`
                                  : "covered"}
                              </span>{" "}
                              <span className="font-semibold text-text">
                                {customer.organisation}
                              </span>{" "}
                              <Link
                                href={`/admin/orders/${customer.reference}`}
                                className="tnum text-navy hover:underline"
                              >
                                {customer.reference}
                              </Link>
                              <span className="text-text-subtle">
                                {" "}
                                &middot; {customer.qty} allocated
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {line.unallocatedShortfall > 0 && (
                        <p className="mt-1 text-xs font-semibold text-text-subtle">
                          {line.unallocatedShortfall} missing with no customer
                          order behind{" "}
                          {line.unallocatedShortfall === 1 ? "it" : "them"}
                          {line.customers.length === 0 && " — nobody is waiting on this line"}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tnum text-text-muted">
                      {/* All three, because the gap between them is the point. */}
                      asked {line.qtyOrdered} · promised {line.qtyConfirmed}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold tnum text-accent">
                        {line.shortfall} missing
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
