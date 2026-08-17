"use client";

import { createContext, useContext, useState, useActionState } from "react";

/**
 * The pieces every admin form is made of.
 *
 * One shape for all of them: a server action returns `{ ok }` or
 * `{ ok: false, error }`, and the form shows the reason in place rather than
 * throwing the admin out to an error page. Validation lives in the service
 * layer, so the message a person reads is the same one that actually stopped
 * the write.
 */

export type FormState = {
  ok: boolean;
  error?: string;
  message?: string;
  /**
   * What was submitted, echoed back so a refused form can be redrawn with it.
   *
   * React resets an uncontrolled form once its action returns, success or
   * failure alike. Without this, being told "that reason is too short" also
   * silently deletes the name, the address and everything else the person had
   * just typed — so the correction costs more than the original entry did.
   */
  values?: Record<string, string>;
} | null;

/* ------------------------------------------------------------------ *
 * Keeping what was typed when a form is refused
 * ------------------------------------------------------------------ */

/**
 * What the person had entered when the form was turned away.
 *
 * React resets an uncontrolled form as soon as its action returns, refusal
 * included. On a short form that is a nuisance; on the new-product form it
 * meant being told "that item code is already used" and losing the name, the
 * description, the price, the pack and every category tick along with it — so
 * correcting one character cost more than the original entry.
 *
 * Captured here rather than echoed back by each action, because an action that
 * has to remember to return every field it read is an action that will
 * eventually forget one, and the field that goes missing is the long one
 * nobody wants to retype.
 */
const Restored = createContext<FormData | null>(null);

/** A single value as it was submitted, or undefined on a clean form. */
export function useRestored(name: string): string | undefined {
  const data = useContext(Restored);
  if (!data) return undefined;
  const value = data.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * Every value posted under one name — checkbox groups, where the question is
 * "was this one ticked" rather than "what was the value". Returns null on a
 * clean form so a caller can tell "nothing was ticked" from "not a redraw".
 */
export function useRestoredList(name: string): string[] | null {
  const data = useContext(Restored);
  if (!data) return null;
  return data.getAll(name).filter((v): v is string => typeof v === "string");
}

export function AdminForm({
  action,
  children,
  submitLabel = "Save changes",
  className = "",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [submitted, setSubmitted] = useState<FormData | null>(null);
  const [attempt, setAttempt] = useState(0);

  const refused = state?.ok === false;

  // An action may still supply its own `values` — for a field it normalised,
  // where redrawing what was typed would be redrawing something we have
  // already decided is wrong. Those win over the raw capture.
  let restored: FormData | null = refused ? submitted : null;
  if (restored && state?.values) {
    const merged = new FormData();
    for (const [key, value] of restored.entries()) merged.append(key, value);
    for (const [key, value] of Object.entries(state.values)) merged.set(key, value);
    restored = merged;
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        setSubmitted(new FormData(event.currentTarget));
        setAttempt((n) => n + 1);
      }}
      className={className}
    >
      {/* Keyed so the inputs genuinely remount and take the restored values:
          changing defaultValue on a mounted uncontrolled input does nothing.
          The key only moves on a refusal, so a form that is behaving is never
          torn down underneath the person using it. */}
      <Restored.Provider value={restored}>
        <div key={restored ? attempt : "clean"}>{children}</div>
      </Restored.Provider>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-red px-5 py-2.5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>

        {state?.ok === false && state.error && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
        {state?.ok === true && (
          <p role="status" className="text-sm font-semibold text-success">
            {state.message ?? "Saved."}
          </p>
        )}
      </div>
    </form>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  hint,
  type = "text",
  required = false,
  placeholder,
  step,
  min,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  hint?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  /**
   * A count and a price are both type="number" and want different things: 1
   * for units per pack, 0.01 for AED. Left unset it stays "any", which is
   * what every existing caller was getting — but a quantity field offering
   * 2.5 in its stepper invites a value the server will only reject later.
   */
  step?: string;
  min?: string;
}) {
  // What was typed wins over what was stored: after a refusal the person is
  // correcting their own entry, not starting again from the saved record.
  const restored = useRestored(name);

  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
        {required && <span className="ml-1 text-red">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={restored ?? defaultValue ?? ""}
        // Prices and quantities are typed often enough that the step matters.
        step={type === "number" ? (step ?? "any") : undefined}
        min={type === "number" ? min : undefined}
        className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-text-subtle">{hint}</span>}
    </label>
  );
}

export function TextArea({
  label,
  name,
  defaultValue,
  hint,
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  hint?: string;
  rows?: number;
}) {
  const restored = useRestored(name);

  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={restored ?? defaultValue ?? ""}
        className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text focus:border-navy focus:outline-none"
      />
      {hint && <span className="mt-1 block text-xs text-text-subtle">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  options,
  hint,
  allowEmpty,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: { value: string; label: string }[];
  hint?: string;
  /** Label for the empty choice, when "none" is a valid answer. */
  allowEmpty?: string;
}) {
  const restored = useRestored(name);

  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <select
        name={name}
        defaultValue={restored ?? defaultValue ?? ""}
        className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
      >
        {allowEmpty && <option value="">{allowEmpty}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-text-subtle">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  // The last value wins on submit, matching how the actions read it: the
  // hidden "0" posts first, the box's "1" after it.
  const restored = useRestoredList(name);
  const wasChecked = restored ? restored.at(-1) === "1" : undefined;

  return (
    <label className="flex items-start gap-2.5">
      {/* The hidden "0" means an unchecked box still posts a value: an absent
          key is indistinguishable from a field that was never rendered. */}
      <input type="hidden" name={name} value="0" />
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={wasChecked ?? defaultChecked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-navy)]"
      />
      <span>
        <span className="block text-sm font-semibold text-text">{label}</span>
        {hint && <span className="block text-xs text-text-subtle">{hint}</span>}
      </span>
    </label>
  );
}

/** A titled panel, so a long edit screen reads as a set of decisions. */
export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
