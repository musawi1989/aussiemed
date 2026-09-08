"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { setBulkBuyStatusAction } from "@/app/admin/bulk-buy/actions";

/**
 * Pending or Completed.
 *
 * ITS OWN FORM, not a control inside the reply box, and that separation is
 * load-bearing: marking a request done must never send an email, and fixing a
 * typo in a quote must never close a request. Two intents, two buttons, two
 * posts.
 *
 * Both directions, because Completed is a judgement about a conversation and
 * judgements get made wrongly — a one-way switch would make a mis-click
 * something only a database edit could undo.
 */
export function BulkBuyStatusToggle({
  requestId,
  status,
  completedBy,
  completedAt,
}: {
  requestId: string;
  status: string;
  completedBy: string | null;
  /** ISO, because a Date cannot cross into a client component. */
  completedAt: string | null;
}) {
  const [state, submit, pending] = useActionState(setBulkBuyStatusAction, null);
  const done = status === "Completed";

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input
        type="hidden"
        name="status"
        value={done ? "Pending" : "Completed"}
      />

      <button
        type="submit"
        disabled={pending}
        className={
          done
            ? "rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
            : "rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        }
      >
        {pending
          ? "Saving…"
          : done
            ? "Reopen"
            : "Mark completed"}
      </button>

      {done && (
        <span className="text-[11px] text-text-subtle">
          Completed{completedBy ? ` by ${completedBy}` : ""}
          {completedAt
            ? ` · ${new Intl.DateTimeFormat("en-GB", {
                timeZone: "Asia/Dubai",
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).format(new Date(completedAt))}`
            : ""}
        </span>
      )}

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
