"use client";

import { useActionState, useState } from "react";
import { emailInvoiceAction } from "@/app/admin/inbox/actions";

/**
 * Sends the customer their invoice.
 *
 * The address is prefilled from the order and editable, because an invoice
 * often goes to an accounts inbox rather than to whoever placed the order —
 * and guessing wrong means it is never paid.
 */
export function EmailInvoiceForm({
  reference,
  defaultTo,
  alreadySentTo,
  compliant,
  reasons,
}: {
  reference: string;
  defaultTo: string | null;
  alreadySentTo: string | null;
  compliant: boolean;
  /** Why it is not compliant, from the same rules the document uses. */
  reasons: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, sending] = useActionState(emailInvoiceAction, null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
      >
        Email invoice
      </button>
    );
  }

  return (
    <form action={submit} className="w-full rounded-card border border-border-strong bg-surface-sunken p-4">
      <input type="hidden" name="reference" value={reference} />

      <p className="text-sm font-bold text-text">Email invoice {reference}</p>

      {!compliant && (
        <div className="mt-2 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-xs text-text">
          <p>
            The email will say plainly that this is a record of what the
            customer was charged rather than a compliant UAE tax invoice. It is
            better to send that than something which looks compliant and is not.
          </p>
          {reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {alreadySentTo && (
        <p className="mt-2 text-xs text-text-subtle">
          Already sent to {alreadySentTo}. Sending to the same address again
          does nothing; a different one goes out.
        </p>
      )}

      <label className="mt-3 block max-w-sm">
        <span className="mb-1 block text-xs font-bold text-text-muted">
          Send to
        </span>
        <input
          name="to"
          type="email"
          required
          defaultValue={
            (state?.ok === false ? state.values?.to : undefined) ??
            defaultTo ??
            ""
          }
          placeholder="accounts@theclinic.example"
          className="h-9 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
        />
        <span className="mt-1 block text-xs text-text-subtle">
          Often the accounts inbox rather than whoever placed the order.
        </span>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={sending}
          className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send invoice"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Close
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
    </form>
  );
}
