"use client";

import { useActionState, useState } from "react";
import {
  approveChangeAction,
  rejectChangeAction,
} from "@/app/admin/approvals/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Approve or turn down one request.
 *
 * Two forms rather than one with a hidden verb, because they are not the same
 * decision: approving carries out a change to a customer's account, and
 * turning one down does not. The note is optional on approval and required on
 * refusal — a customer who is told no needs to know why, and one who is told
 * yes has already got what they asked for.
 */
export function ChangeDecision({ changeId }: { changeId: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [approveState, approve, approving] = useActionState(
    approveChangeAction,
    null
  );
  const [rejectState, reject, pending] = useActionState(rejectChangeAction, null);

  const feedback = approveState ?? rejectState;

  return (
    <div className="mt-3 border-t border-border-base pt-3">
      {!rejecting ? (
        <form action={approve} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="changeId" value={changeId} />
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-bold text-text-muted">
              Note (optional)
            </span>
            <input
              name="note"
              placeholder="Confirmed by phone with the practice manager"
              className="h-9 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
            />
          </label>
          <button
            type="submit"
            disabled={approving}
            className="h-9 shrink-0 rounded-card bg-success px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {approving ? "Applying…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="h-9 shrink-0 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text-muted transition-colors hover:text-danger"
          >
            Turn down
          </button>
        </form>
      ) : (
        <form action={reject} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="changeId" value={changeId} />
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs font-bold text-text-muted">
              Why not? The customer sees this.
            </span>
            <input
              name="note"
              required
              minLength={5}
              autoFocus
              placeholder="We could not reach anyone at the practice to confirm the address"
              className="h-9 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="h-9 shrink-0 rounded-card bg-danger px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Turn down"}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="h-9 shrink-0 rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Cancel
          </button>
        </form>
      )}

      {feedback?.ok === false && feedback.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {feedback.error}
        </p>
      )}
      {feedback?.ok === true && (
        <p role="status" className="mt-2 text-sm font-semibold text-success">
          {feedback.message}
        </p>
      )}
    </div>
  );
}
