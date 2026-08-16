"use client";

import { useActionState } from "react";
import { setAvailabilityAction } from "@/app/business-portal/actions";

/**
 * The whole company in or out.
 *
 * Blunt on purpose, and worded so nobody switches it off thinking it means
 * "busy this week": while it is off, every line where they are the primary
 * supplier goes to somebody else.
 */
export function AvailabilityToggle({ available }: { available: boolean }) {
  const [state, submit, pending] = useActionState(setAvailabilityAction, null);

  return (
    <section
      className={`rounded-card border p-5 shadow-card ${
        available ? "border-border-base bg-surface" : "border-accent-border bg-accent-soft"
      }`}
    >
      <h2 className="text-base font-bold tracking-tight text-text">
        {available ? "You are open for orders" : "You are not taking orders"}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-text-muted">
        {available
          ? "Turn this off if you cannot supply anything at all — closed, on holiday, or stock-taking. Everything you are the first choice for goes to the other supplier until you turn it back on."
          : "Nothing is being ordered from you. Everything you are the first choice for is going to the other supplier."}
      </p>

      <form action={submit} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="available" value={available ? "no" : "yes"} />
        <button
          type="submit"
          disabled={pending}
          className={`h-10 rounded-card px-5 text-sm font-bold transition-colors disabled:opacity-60 ${
            available
              ? "border border-border-strong bg-surface text-text hover:bg-surface-hover"
              : "bg-navy text-on-navy hover:bg-navy-hover"
          }`}
        >
          {pending
            ? "Saving…"
            : available
              ? "I cannot supply at the moment"
              : "I can supply again"}
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
      </form>
    </section>
  );
}
