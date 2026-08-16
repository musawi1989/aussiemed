"use client";

import { useActionState } from "react";
import { markAllReadAction } from "@/app/admin/inbox/actions";

export function MarkAllRead() {
  const [state, submit, pending] = useActionState(markAllReadAction, null);

  return (
    <form action={submit} className="flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        {pending ? "Marking…" : "Mark all read"}
      </button>
      {state?.ok === true && (
        <span role="status" className="text-sm font-semibold text-success">
          {state.message}
        </span>
      )}
    </form>
  );
}
