"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import {
  buildTodayAction,
  cancelDraftAction,
  sendAction,
  sendAllAction,
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
    <RestoringForm state={state} saveAll={false}
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
    </RestoringForm>
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

/**
 * Push every draft at once, for when the day's rhythm is not the right one.
 *
 * The count is in the label rather than only in the confirm, because "Send
 * all drafts" and "Send all 6 drafts" are different amounts of commitment and
 * the person should know which one they are agreeing to before they press it.
 *
 * The caller only renders this when a draft exists — a button that reports
 * "there were no drafts waiting" is a button that should not have been there.
 */
export function SendAllButton({ count }: { count: number }) {
  return (
    <ActionButton
      action={sendAllAction}
      label={`Send all ${count} draft${count === 1 ? "" : "s"}`}
      busyLabel="Sending…"
      className="rounded-card border border-navy bg-surface px-3 py-2 text-sm font-bold text-navy transition-colors hover:bg-navy hover:text-on-navy disabled:opacity-60"
      confirm={`Send ${count} purchase order${count === 1 ? "" : "s"} to their suppliers now? This commits ${count === 1 ? "it" : "them all"} and cannot be undone.`}
    />
  );
}

export function SendButton({ id, poNumber, amendment = false }: { id: string; poNumber: string; amendment?: boolean }) {
  return (
    <ActionButton
      action={sendAction}
      fields={{ id, poNumber }}
      label={amendment ? "Send order update" : "Send to supplier"}
      busyLabel="Sending…"
      className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
      confirm={amendment ? `Send the latest ${poNumber} quantities to the supplier? Unchanged updates are not duplicated.` : `Send ${poNumber} to the supplier? This commits the order.`}
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
