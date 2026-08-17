"use client";

import { useActionState, useState } from "react";
import { decideApplicationAction } from "@/app/admin/applications/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Approve, or turn down with a reason.
 *
 * Approving is one click, because it is the common case and the details are on
 * the card above. Turning down opens a box first, and the reason is required —
 * it goes to the applicant, and a refusal with nothing in it produces a phone
 * call rather than a corrected application. The rule is enforced in the
 * service layer; this only saves the round trip.
 */
export function ApplicationDecision({
  userId,
  companyName,
}: {
  userId: string;
  companyName: string;
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    decideApplicationAction,
    null
  );
  const [refusing, setRefusing] = useState(false);

  if (state?.ok === true) {
    return (
      <p role="status" className="text-sm font-semibold text-success">
        {state.message}
      </p>
    );
  }

  return (
    <form action={submit} className="w-full">
      <input type="hidden" name="userId" value={userId} />

      {refusing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Why not? This is sent to them
            </span>
            <textarea
              name="reason"
              required
              rows={2}
              placeholder="We only supply businesses registered for VAT in the UAE."
              className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              name="decision"
              value="reject"
              disabled={pending}
              className="rounded-card bg-danger px-3 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Turn down and email them"}
            </button>
            <button
              type="button"
              onClick={() => setRefusing(false)}
              className="text-sm font-semibold text-text-muted hover:text-navy"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={pending}
            className="rounded-card bg-success px-4 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Approving…" : `Approve ${companyName}`}
          </button>
          <button
            type="button"
            onClick={() => setRefusing(true)}
            className="rounded-card border border-border-strong px-3 py-1.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Turn down
          </button>
        </div>
      )}

      {state?.ok === false && state.error && (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
