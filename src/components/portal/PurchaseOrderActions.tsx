"use client";

import { useActionState } from "react";
import { acknowledgeAction, dispatchAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";
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
export function DispatchForm({
  id,
  poNumber,
  courier,
  courierOptions,
  trackingNumber,
}: {
  id: string;
  poNumber: string;
  courier: string | null;
  /** From courierOptions() on the server. Empty falls back to a text box. */
  courierOptions: string[];
  trackingNumber: string | null;
}) {
  const [state, submit, pending] = useActionState(dispatchAction, null);

  return (
    <form action={submit} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="poNumber" value={poNumber} />

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
          {pending ? "Saving…" : "Mark as despatched"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
