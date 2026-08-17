"use client";

import { useActionState } from "react";
import { setNotifyStepAction } from "@/app/admin/settings/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Which steps email the customer.
 *
 * Every step is on by default, because that is what was asked for. The switches
 * exist because four automatic emails per order is a real change of character
 * for a business that describes itself as relationship-led — and the answer to
 * "this is too many" should be a click here rather than a conversation with a
 * developer.
 *
 * There is no switch for the order being received. Checkout already sends a
 * confirmation, and a second email seconds later saying the same thing is how
 * people learn that ours are not worth opening.
 */
export function OrderEmailSettings({
  steps,
}: {
  steps: { step: string; label: string; enabled: boolean }[];
}) {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">
        Emails as an order moves
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        Sent automatically when you change an order&rsquo;s status. One per order
        per step, ever — correcting a status back and forth does not email the
        customer again.
      </p>

      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <StepToggle key={step.step} {...step} />
        ))}
      </ul>

      <p className="mt-4 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        Nothing is sent when an order is first received — checkout already
        confirms it. Every send is recorded under Email, where a failure can be
        retried.
      </p>
    </section>
  );
}

function StepToggle({
  step,
  label,
  enabled,
}: {
  step: string;
  label: string;
  enabled: boolean;
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setNotifyStepAction,
    null
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface-sunken px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-bold text-text">{label}</p>
        <p className="text-xs text-text-subtle tnum">{step}</p>
      </div>

      <form action={submit} className="flex items-center gap-2">
        <input type="hidden" name="step" value={step} />
        {/* The hidden "0" means an unticked box still posts: an absent key is
            indistinguishable from a field that was never rendered. */}
        <input type="hidden" name="enabled" value="0" />
        <label className="flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={enabled}
            className="h-4 w-4 accent-[var(--color-navy)]"
          />
          Email the customer
        </label>
        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-card border border-border-strong bg-surface px-3 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {state?.ok === true && (
          <span role="status" className="text-xs font-semibold text-success">
            Saved
          </span>
        )}
        {state?.ok === false && state.error && (
          <span role="alert" className="text-xs font-semibold text-danger">
            {state.error}
          </span>
        )}
      </form>
    </li>
  );
}
