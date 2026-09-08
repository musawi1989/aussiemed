"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { recordDocketAction } from "@/app/admin/purchasing/actions";
import { CourierPicker } from "@/components/CourierPicker";
import type { FormState } from "@/components/AdminForm";
import { DocketEditor } from "@/components/DocketEditor";
import type { DocketSummary } from "@/lib/dockets";

const dubai = (d: Date) =>
  new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

export type AdminDocketRow = {
  id: string;
  sequence: number;
  courier: string | null;
  trackingNumber: string | null;
  dispatchedAt: Date | null;
  note: string | null;
  createdByName: string;
  createdByRole: string;
  units: number;
  lineCount: number;
  lines: DocketSummary["lines"];
};

export type OutstandingRow = {
  id: string;
  code: string;
  name: string;
  qtyOrdered: number;
  outstanding: number;
  suggested: number;
};

/**
 * Consignments against a purchase order, on our side of the portal.
 *
 * Two jobs on one panel: what the supplier has already sent, and a form to
 * record one they told us about by another route. The list comes first — the
 * question anyone opens a part-delivered order with is what has arrived so
 * far, and the answer decides whether the form is even needed.
 *
 * RECORDED, NOT REQUESTED. Entering a docket here does not ask the supplier
 * for anything; it writes down what they have said went. It is stamped Admin
 * so the trail distinguishes it from one they raised themselves, which matters
 * the day the two accounts disagree about what was in the box.
 */
export function RecordDocket({
  id,
  poNumber,
  dockets,
  outstanding,
  courier,
  courierOptions,
  trackingNumber,
  complete,
}: {
  id: string;
  poNumber: string;
  dockets: AdminDocketRow[];
  outstanding: OutstandingRow[];
  courier: string | null;
  courierOptions: string[];
  trackingNumber: string | null;
  complete: boolean;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    recordDocketAction,
    null
  );
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(outstanding.map((l) => [l.id, l.suggested]))
  );
  const savedPlan = useRef(JSON.stringify([dockets.length, outstanding]));
  useEffect(() => {
    const signature = JSON.stringify([dockets.length, outstanding]);
    if (signature === savedPlan.current) return;
    savedPlan.current = signature;
    setValues(Object.fromEntries(outstanding.map((line) => [line.id, line.suggested])));
  }, [dockets.length, outstanding]);

  const owed = outstanding.reduce((n, l) => n + l.outstanding, 0);
  const going = outstanding.reduce((n, l) => n + (values[l.id] ?? 0), 0);

  return (
    <section className="mt-5 rounded-card border border-border-base bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold tracking-tight text-text">
          Delivery dockets
        </h2>
        {!complete && outstanding.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:border-navy hover:text-navy"
          >
            {open ? "Cancel" : "Record a docket"}
          </button>
        )}
      </div>

      {dockets.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">
          Nothing has been sent against this order yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {dockets.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border-base px-3 py-2 text-xs"
            >
              <span className="tnum text-text">
                <span className="font-bold">Docket {d.sequence}</span>
                {" · "}
                {d.units} unit{d.units === 1 ? "" : "s"} over {d.lineCount} line
                {d.lineCount === 1 ? "" : "s"}
                {d.dispatchedAt ? ` · sent ${dubai(d.dispatchedAt)}` : " · not sent yet"}
                {d.courier ? ` · ${d.courier}` : ""}
                {d.trackingNumber ? ` · ${d.trackingNumber}` : ""}
                {/* Who entered it. A docket we typed in is a different kind of
                    evidence from one the supplier raised themselves. */}
                <span className="ml-1 text-text-subtle">
                  · {d.createdByRole === "Admin" ? "recorded by " : "raised by "}
                  {d.createdByName}
                </span>
              </span>
              <Link
                href={`/admin/purchasing/${encodeURIComponent(poNumber)}/docket/${d.sequence}`}
                className="shrink-0 rounded-card border border-border-strong bg-surface px-2.5 py-1 font-bold text-text transition-colors hover:border-navy hover:text-navy"
              >
                Print
              </Link>
              <DocketEditor docket={d} />
            </li>
          ))}
        </ul>
      )}

      {complete && dockets.length > 0 && (
        <p className="mt-3 text-xs font-semibold text-success">
          Everything ordered has been sent across {dockets.length} docket
          {dockets.length === 1 ? "" : "s"}.
        </p>
      )}

      {open && !complete && (
        <RestoringForm key={dockets.length} state={state} saveAll={false} action={submit} className="mt-4 border-t border-border-base pt-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="poNumber" value={poNumber} />

          <div className="overflow-x-auto rounded-card border border-border-base">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <thead className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Still owed</th>
                  <th className="px-3 py-2 text-center">On this docket</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map((line) => (
                  <tr key={line.id} className="border-b border-border-base last:border-0">
                    <td className="px-3 py-2">
                      <span className="block font-semibold text-text">{line.name}</span>
                      <span className="block text-xs tnum text-text-subtle">
                        {line.code}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tnum font-bold text-text">
                      {line.outstanding}
                      {line.outstanding < line.qtyOrdered && (
                        <span className="ml-1 text-xs font-normal text-text-subtle">
                          of {line.qtyOrdered}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="hidden" name="docketLineId" value={line.id} />
                      <input
                        name="docketQty"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={line.outstanding}
                        value={values[line.id] ?? 0}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [line.id]: Math.max(
                              0,
                              Math.min(line.outstanding, Number(e.target.value) || 0)
                            ),
                          }))
                        }
                        aria-label={`How many ${line.name} on this docket, of ${line.outstanding} still owed`}
                        className="w-16 rounded-card border border-border-strong bg-surface px-2 py-1.5 text-center text-sm tnum text-text"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs tnum text-text-muted">
            <span className="font-semibold text-text">{going}</span> of {owed}{" "}
            outstanding
            {owed - going > 0 && (
              <span className="font-semibold text-danger">
                {" "}&middot; {owed - going} stays outstanding
              </span>
            )}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <CourierPicker
              value={courier}
              options={courierOptions}
              labelClassName="mb-1 block text-xs font-bold text-text"
              inputClassName="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
            />
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text">
                Tracking number
              </span>
              <input
                name="trackingNumber"
                defaultValue={dockets.length ? "" : trackingNumber ?? ""}
                placeholder="Optional"
                className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-bold text-text">Note</span>
            <input
              name="note"
              placeholder="Optional — how this reached us, who confirmed it"
              className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Record this docket"}
            </button>
            {state?.ok === false && state.error && (
              <span role="alert" className="text-xs font-semibold text-danger">
                {state.error}
              </span>
            )}
            {state?.ok === true && state.message && (
              <span role="status" className="text-xs font-semibold text-success">
                {state.message}
              </span>
            )}
          </div>
        </RestoringForm>
      )}
    </section>
  );
}
