"use client";

import { useActionState } from "react";

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

  return (
    <form action={formAction} className={className}>
      {children}

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
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  hint?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
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
        defaultValue={defaultValue ?? ""}
        // Prices and quantities are typed often enough that the step matters.
        step={type === "number" ? "any" : undefined}
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
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ""}
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
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
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
  return (
    <label className="flex items-start gap-2.5">
      {/* The hidden "0" means an unchecked box still posts a value: an absent
          key is indistinguishable from a field that was never rendered. */}
      <input type="hidden" name={name} value="0" />
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
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
