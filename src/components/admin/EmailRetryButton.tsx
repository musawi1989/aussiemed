"use client";

import { useActionState } from "react";
import { retryEmailAction } from "@/app/admin/emails/actions";

/** Sends again down exactly the same path as the first attempt. */
export function EmailRetryButton({ id }: { id: string }) {
  const [state, submit, pending] = useActionState(retryEmailAction, null);

  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send again"}
      </button>
      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
