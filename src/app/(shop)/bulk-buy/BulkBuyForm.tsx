"use client";

import { useActionState } from "react";
import { bulkBuyAction, type EnquiryState } from "@/app/(shop)/enquiry-actions";

/**
 * Volume pricing enquiries — FN-03.
 *
 * These used to resolve to a message on screen and nothing else, which meant
 * the highest-intent visitors on the site were lost on arrival. They are now
 * recorded and appear in the admin enquiry queue.
 */
export function BulkBuyForm({ about }: { about?: string }) {
  const [state, submit, pending] = useActionState<EnquiryState, FormData>(
    bulkBuyAction,
    null
  );

  if (state?.ok) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-8 text-center shadow-card">
        <h2 className="text-lg font-semibold text-text">Enquiry received</h2>
        <p className="mt-2 text-sm text-text-muted">
          It is with our team and someone will come back to you with pricing.
        </p>
      </div>
    );
  }

  return (
    <form
      action={submit}
      className="space-y-4 rounded-panel border border-border-base bg-surface p-6 shadow-card"
    >
      {/* What the buyer was looking at when they found nothing. Travels with
          the enquiry rather than being typed again. */}
      {about && <input type="hidden" name="about" value={about} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Clinic or company name" name="company" required />
        <Field label="Contact name" name="contact" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone" name="phone" type="tel" required />
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-text">
          Products and quantities<span className="ml-0.5 text-danger">*</span>
        </span>
        <textarea
          name="items"
          required
          rows={5}
          placeholder={
            "e.g.\nNitrile gloves medium — 40 boxes per month\nAlcohol hand rub 500mL — 120 units"
          }
          className="w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-subtle"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-text">
          Delivery schedule
        </span>
        <select
          name="schedule"
          className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
        >
          <option>One-off order</option>
          <option>Monthly recurring</option>
          <option>Quarterly recurring</option>
          <option>Not sure yet</option>
        </select>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-card bg-brand font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {pending ? "Sending…" : "Send enquiry"}
        </button>
        {state?.ok === false && (
          <p role="alert" className="text-sm font-semibold text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
      />
    </label>
  );
}
