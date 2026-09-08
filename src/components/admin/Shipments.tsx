"use client";

import { RestoringForm } from "@/components/AdminForm";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createShipmentAction,
  deleteShipmentAction,
  updateShipmentTrackingAction,
} from "@/app/admin/orders/[reference]/shipment-actions";
import type { FormState } from "@/components/AdminForm";

type PlanLine = {
  id: string;
  name: string;
  skuCode: string;
  unitLabel: string;
  qty: number;
  status: string;
  shipped: number;
  reserved?: number;
  outstanding: number;
  settled: boolean;
};

type Shipment = {
  id: string;
  sequence: number;
  courier: string | null;
  trackingNumber: string | null;
  /** Pre-formatted on the server, like every other date on this page. */
  dispatchedOn: string | null;
  note: string | null;
  createdOn: string;
  createdByName: string;
  units: number;
  lines: { orderItemId: string; name: string; skuCode: string; unitLabel: string; qty: number }[];
};

/**
 * Despatching an order in batches.
 *
 * WHAT WAS WRONG BEFORE. One packing list per order, listing every line
 * including the ones still on a shelf, and one tracking number on the order.
 * So an order with a back order on it — which is most of the interesting ones —
 * went out twice and could only be documented once. The second consignment
 * overwrote the first, and a customer ringing about the second box could not be
 * answered.
 *
 * Now: each batch is its own packing list with its own courier and consignment
 * number, listing only what is actually in that box, and the form for the next
 * one defaults to whatever is still owed. Repeat until nothing is.
 *
 * THE OUTSTANDING COLUMN IS THE POINT OF THE TABLE. Ordered and shipped are
 * both there so the arithmetic is checkable, but the number the packer works
 * from is what is left, and it is the one the form is pre-filled with.
 */
export function Shipments({
  reference,
  lines,
  shipments,
  complete,
  nextSequence,
  courierOptions,
}: {
  reference: string;
  lines: PlanLine[];
  shipments: Shipment[];
  complete: boolean;
  nextSequence: number;
  courierOptions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(createShipmentAction, null);

  const owed = lines.filter((line) => !line.settled);
  const owedUnits = owed.reduce((n, line) => n + line.outstanding, 0);
  const awaitingDispatch = lines.filter(line => line.status !== "Cancelled" && line.shipped < line.qty);
  const remainingUnits = awaitingDispatch.reduce((sum, line) => sum + line.qty - line.shipped, 0);

  return (
    <section className="mt-6 rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-bold tracking-tight text-text">
          Packing lists &amp; despatch
        </h2>
        {complete ? (
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-bold text-success">
            Everything has gone
          </span>
        ) : (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold tnum text-accent">
            {remainingUnits} unit{remainingUnits === 1 ? "" : "s"} awaiting despatch
          </span>
        )}
      </div>

      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
        Each despatch gets its own packing list, its own courier and its own
        tracking number, and lists only what is in that box. Send what you have;
        the rest stays owed and goes on the next one.
      </p>

      {/* --- what has already gone --- */}

      {shipments.length > 0 && (
        <ul className="mt-4 space-y-3">
          {shipments.map((shipment) => (
            <ShipmentRow
              key={shipment.id}
              reference={reference}
              shipment={shipment}
              courierOptions={courierOptions}
              isLast={shipment.sequence === nextSequence - 1}
            />
          ))}
        </ul>
      )}

      {/* --- what is still owed --- */}

      {complete ? (
        <p className="mt-4 rounded-card border-l-4 border-success/40 bg-success/5 px-3 py-2 text-sm text-text">
          Every line on this order has been sent. There is nothing left to put
          on a packing list.
        </p>
      ) : (
        <div className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                  <th scope="col" className="py-1.5 pr-4 font-bold">Still owed</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-bold">Ordered</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-bold">Sent</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-bold">Prepared</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-bold">Unpacked</th>
                </tr>
              </thead>
              <tbody>
                {awaitingDispatch.map((line) => (
                  <tr key={line.id} className="border-b border-border-base last:border-0">
                    <td className="py-1.5 pr-4">
                      <span className="font-semibold text-text">{line.name}</span>
                      <span className="block text-xs tnum text-text-subtle">
                        {line.skuCode} · {line.unitLabel}
                        {line.status === "Backordered" && (
                          <span className="ml-1 font-bold text-accent">· on back order</span>
                        )}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tnum text-text-subtle">{line.qty}</td>
                    <td className="py-1.5 pr-3 text-right tnum text-text-subtle">{line.shipped}</td>
                    <td className="py-1.5 pr-3 text-right tnum text-text-subtle">{line.reserved ?? 0}</td>
                    <td className="py-1.5 pr-3 text-right font-bold tnum text-text">
                      {line.outstanding}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {owedUnits === 0 ? (
            <p className="mt-3 text-xs text-text-muted">The remaining units are on prepared packing lists above.</p>
          ) : !open ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover"
              >
                New packing list {shipments.length > 0 && `(${nextSequence})`}
              </button>
              <Feedback state={state} />
            </div>
          ) : (
            <RestoringForm key={nextSequence} state={state} saveAll={false} action={submit} className="mt-3 rounded-card border border-border-strong bg-surface-sunken p-3">
              <input type="hidden" name="reference" value={reference} />

              <p className="text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                What is going in this box — packing list {nextSequence}
              </p>
              <p className="mt-0.5 text-[11px] text-text-subtle">
                Pre-filled with everything owed. Reduce a number to send part of
                a line, or clear it to leave the line out entirely.
              </p>

              <div className="mt-2 space-y-1.5">
                {owed.map((line) => (
                  <label
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-surface px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 text-sm text-text">
                      {line.name}
                      <span className="block text-[11px] tnum text-text-subtle">
                        {line.skuCode} · {line.outstanding} owed
                      </span>
                    </span>
                    <input type="hidden" name="lineId" value={line.id} />
                    <input
                      name="lineQty"
                      type="number"
                      min={0}
                      max={line.outstanding}
                      defaultValue={line.outstanding}
                      aria-label={`Quantity of ${line.name} in this box`}
                      className="w-24 rounded-card border border-border-strong bg-surface px-2 py-1 text-sm tnum text-text focus:border-navy focus:outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                    Courier
                  </span>
                  <input
                    name="courier"
                    list="shipment-couriers"
                    defaultValue={state?.values?.courier ?? ""}
                    placeholder="Aramex"
                    className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                    Tracking number
                  </span>
                  <input
                    name="trackingNumber"
                    defaultValue={state?.values?.trackingNumber ?? ""}
                    placeholder="Their consignment number"
                    className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
                  />
                </label>
              </div>

              <label className="mt-2 block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                  Note on this batch <span className="font-normal">(optional, prints on the list)</span>
                </span>
                <input
                  name="note"
                  defaultValue={state?.values?.note ?? ""}
                  placeholder="Sent in two cartons. Gloves to follow."
                  className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
                />
              </label>

              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  name="dispatched"
                  defaultChecked
                  className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
                />
                <span className="text-xs text-text">
                  <span className="font-bold">It has gone today</span>
                  <span className="block text-[11px] text-text-subtle">
                    Leave this off to print the list now and record the despatch
                    once the courier has actually collected.
                  </span>
                </span>
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
                >
                  {pending ? "Creating…" : "Create packing list"}
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
          )}
        </div>
      )}

      <datalist id="shipment-couriers">
        {courierOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </section>
  );
}

/**
 * One despatch that has already happened.
 *
 * What was in the box is shown and not editable — it is a document that
 * travelled. The courier and consignment number are, because those are
 * routinely booked after the box is packed, and the whole point of recording a
 * despatch before it goes is that the list can be printed first.
 */
function ShipmentRow({
  reference,
  shipment,
  courierOptions,
  isLast,
}: {
  reference: string;
  shipment: Shipment;
  courierOptions: string[];
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, submit, pending] = useActionState(updateShipmentTrackingAction, null);
  const [removeState, remove, removing] = useActionState(deleteShipmentAction, null);

  return (
    <li className="rounded-card border border-border-base bg-surface-sunken p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">
            Packing list {shipment.sequence}
            <span className="ml-2 font-normal tnum text-text-subtle">
              {shipment.units} unit{shipment.units === 1 ? "" : "s"} ·{" "}
              {shipment.lines.length} line{shipment.lines.length === 1 ? "" : "s"}
            </span>
          </p>
          <p className="mt-0.5 text-xs tnum text-text-subtle">
            {shipment.dispatchedOn
              ? `Left us ${shipment.dispatchedOn}`
              : "Packed, not yet gone"}{" "}
            · made by {shipment.createdByName} on {shipment.createdOn}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/admin/orders/${reference}/delivery-note/${shipment.sequence}`}
            className="rounded-card border border-border-strong bg-surface px-2.5 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Print
          </Link>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-xs font-bold text-navy hover:underline"
          >
            {editing ? "Close" : "Tracking"}
          </button>
        </div>
      </div>

      <ul className="mt-2 space-y-0.5">
        {shipment.lines.map((line) => (
          <li key={line.orderItemId} className="text-xs text-text-muted">
            <span className="font-bold tnum text-text">{line.qty}×</span> {line.name}
            <span className="text-text-subtle"> · {line.skuCode}</span>
          </li>
        ))}
      </ul>

      {(shipment.courier || shipment.trackingNumber) && !editing && (
        <p className="mt-2 text-xs tnum text-text">
          <span className="font-bold">{shipment.courier ?? "Courier not named"}</span>
          {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : " · no tracking number yet"}
        </p>
      )}
      {!shipment.courier && !shipment.trackingNumber && !editing && (
        <p className="mt-2 text-xs font-semibold text-accent">
          No courier or tracking number on this one yet.
        </p>
      )}

      {shipment.note && !editing && (
        <p className="mt-1 text-xs italic text-text-muted">{shipment.note}</p>
      )}

      {editing && (
        <RestoringForm state={state} saveAll={false} action={submit} className="mt-2 border-t border-border-base pt-2">
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="shipmentId" value={shipment.id} />

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                Courier
              </span>
              <input
                name="courier"
                list="shipment-couriers"
                defaultValue={shipment.courier ?? ""}
                className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                Tracking number
              </span>
              <input
                name="trackingNumber"
                defaultValue={shipment.trackingNumber ?? ""}
                className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm tnum text-text focus:border-navy focus:outline-none"
              />
            </label>
          </div>

          <label className="mt-2 block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
              Note on this batch
            </span>
            <input
              name="note"
              defaultValue={shipment.note ?? ""}
              className="w-full rounded-card border border-border-strong bg-surface px-2 py-1.5 text-sm text-text focus:border-navy focus:outline-none"
            />
          </label>

          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              name="dispatched"
              defaultChecked={Boolean(shipment.dispatchedOn)}
              className="h-4 w-4 shrink-0 accent-navy"
            />
            <span className="text-xs font-bold text-text">It has gone</span>
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save tracking"}
            </button>
            <Feedback state={state} />
          </div>
        </RestoringForm>
      )}

      {/* A SIBLING OF THE TRACKING FORM, NOT INSIDE IT. A form nested in a form
          is invalid HTML, and browsers resolve it by dropping the inner one —
          so the button would have submitted the tracking form instead and
          silently saved rather than removed.

          Only offered on the newest one, and only before it has gone: deleting
          an earlier list would leave a gap in the numbering the customer's
          paperwork already refers to. The service refuses either way; this just
          does not dangle a button that cannot work. */}
      {editing && isLast && !shipment.dispatchedOn && (
        <RestoringForm state={removeState} saveAll={false} action={remove} onSubmit={event => { if (!window.confirm(`Remove packing list ${shipment.sequence}? Its quantities will become available to pack again.`)) event.preventDefault(); }} className="mt-3 border-t border-border-base pt-2">
          <input type="hidden" name="reference" value={reference} />
          <input type="hidden" name="shipmentId" value={shipment.id} />
          <button
            type="submit"
            disabled={removing}
            className="text-xs font-bold text-danger hover:underline disabled:opacity-60"
          >
            {removing ? "Removing…" : "Remove this packing list"}
          </button>
          <span className="ml-2 text-[11px] text-text-subtle">
            The lines go back to being owed.
          </span>
          <Feedback state={removeState} />
        </RestoringForm>
      )}
    </li>
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
