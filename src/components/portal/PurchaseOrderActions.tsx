"use client";

import { useActionState, useState } from "react";
import { acknowledgeAction, dispatchAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";
import { RestoringForm } from "@/components/AdminForm";
import { CourierPicker } from "@/components/CourierPicker";

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <span role="alert" className="text-xs font-semibold text-danger">
        {state.error}
      </span>
    );
  }
  if (state?.ok === true) {
    return (
      <span role="status" className="text-xs font-semibold text-success">
        {state.message}
      </span>
    );
  }
  return null;
}

export function AcknowledgeButton({
  id,
  poNumber,
}: {
  id: string;
  poNumber: string;
}) {
  const [state, submit, pending] = useActionState(acknowledgeAction, null);

  return (
    <form action={submit} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="poNumber" value={poNumber} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Acknowledge"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Despatch, with the courier and tracking the sorting facility will look for.
 * Both optional — a supplier delivering on their own van has neither, and
 * demanding a tracking number they cannot give would only teach them to invent
 * one.
 */
export type DocketableRow = {
  id: string;
  code: string;
  name: string;
  qtyOrdered: number;
  outstanding: number;
  suggested: number;
};

export function DispatchForm({
  id,
  poNumber,
  courier,
  courierOptions,
  trackingNumber,
  lines,
}: {
  id: string;
  poNumber: string;
  courier: string | null;
  /** From courierOptions() on the server. Empty falls back to a text box. */
  courierOptions: string[];
  trackingNumber: string | null;
  /** What is still outstanding. Only lines with something left to send. */
  lines: DocketableRow[];
}) {
  const [state, submit, pending] = useActionState(dispatchAction, null);

  /*
   * OPENS AT WHAT IS STILL OUTSTANDING, not at what was promised.
   *
   * A supplier filling the rest of an order should not have to retype what is
   * owed, and the promise is only a claim — one who said four and found six
   * can send six. The number here is what is physically going, so it is theirs
   * to change and the server judges what they actually typed.
   */
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.suggested]))
  );

  const clamp = (line: DocketableRow, next: number) =>
    Math.max(0, Math.min(line.outstanding, Number.isFinite(next) ? next : 0));

  const going = lines.reduce((n, l) => n + (values[l.id] ?? 0), 0);
  const owed = lines.reduce((n, l) => n + l.outstanding, 0);
  const leftBehind = owed - going;

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="poNumber" value={poNumber} />

      {/*
        What is actually in this consignment. Editable, because the whole
        reason dockets exist is that "what was ordered" and "what is in the
        box" are different numbers more often than not.
      */}
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
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border-base last:border-0">
                <td className="px-3 py-2">
                  <span className="block font-semibold text-text">{line.name}</span>
                  <span className="block text-xs tnum text-text-subtle">{line.code}</span>
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
                        [line.id]: clamp(line, Number(e.target.value)),
                      }))
                    }
                    aria-label={`How many ${line.name} are on this docket, of ${line.outstanding} still owed`}
                    className="w-16 rounded-card border border-border-strong bg-surface px-2 py-1.5 text-center text-sm tnum text-text"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Said before the button, so a part consignment is a deliberate act
          rather than something noticed afterwards. */}
      <p className="mt-2 text-xs tnum text-text-muted">
        <span className="font-semibold text-text">{going}</span> of {owed} outstanding
        {leftBehind > 0 && (
          <span className="font-semibold text-danger">
            {" "}&middot; {leftBehind} stays outstanding for a later docket
          </span>
        )}
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-bold text-text">
          Note for this consignment
        </span>
        <input
          name="note"
          placeholder="Optional — 'two cartons', 'gloves to follow'"
          className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
        />
      </label>


      <div className="grid gap-3 sm:grid-cols-2">
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
            defaultValue={trackingNumber ?? ""}
            placeholder="Optional"
            className="h-9 w-full rounded-card border border-border-strong bg-surface px-2.5 text-sm text-text"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-red px-4 py-2 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Record this docket"}
        </button>
        <Feedback state={state} />
      </div>
    </RestoringForm>
  );
}
