"use client";

import { useActionState } from "react";
import {
  buildTodayAction,
  cancelDraftAction,
  sendAction,
  setAutoSendAction,
} from "@/app/admin/purchasing/actions";
import type { FormState } from "@/components/AdminForm";

/** One button, one intent, its own pending state and its own message. */
function ActionButton({
  action,
  fields,
  label,
  busyLabel,
  className,
  confirm,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  fields?: Record<string, string>;
  label: string;
  busyLabel: string;
  className: string;
  confirm?: string;
}) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <form
      action={submit}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? busyLabel : label}
      </button>
      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
      {state?.ok === true && (
        <span role="status" className="text-xs font-semibold text-success">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function BuildButton({ cutoffLabel }: { cutoffLabel: string }) {
  return (
    <ActionButton
      action={buildTodayAction}
      label="Build purchase orders"
      busyLabel="Building…"
      className="rounded-card bg-red px-4 py-2 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
      confirm={`Build drafts for everything ordered up to ${cutoffLabel}? Nothing is sent to a supplier by this.`}
    />
  );
}

export function SendButton({ id, poNumber }: { id: string; poNumber: string }) {
  return (
    <ActionButton
      action={sendAction}
      fields={{ id, poNumber }}
      label="Send to supplier"
      busyLabel="Sending…"
      className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
      confirm={`Send ${poNumber} to the supplier? This commits the order.`}
    />
  );
}

export function CancelDraftButton({ id, poNumber }: { id: string; poNumber: string }) {
  return (
    <ActionButton
      action={cancelDraftAction}
      fields={{ id }}
      label="Cancel draft"
      busyLabel="Cancelling…"
      className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:text-danger disabled:opacity-60"
      confirm={`Cancel draft ${poNumber}? Its lines go back into the queue to be placed again.`}
    />
  );
}

export function AutoSendToggle({ on }: { on: boolean }) {
  return (
    <ActionButton
      action={setAutoSendAction}
      fields={{ on: String(!on) }}
      label={on ? "Turn auto-send off" : "Turn auto-send on"}
      busyLabel="Saving…"
      className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text-muted transition-colors hover:text-navy disabled:opacity-60"
      confirm={
        on
          ? undefined
          : "Turn auto-send on? Purchase orders will go to suppliers at the cutoff with nobody reviewing them first."
      }
    />
  );
}
