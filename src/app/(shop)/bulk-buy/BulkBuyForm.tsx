"use client";

import { useState } from "react";

/** Captured locally for now — submission needs the backend and a mail transport. */
export function BulkBuyForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-8 text-center shadow-card">
        <h2 className="text-lg font-semibold text-text">Enquiry noted</h2>
        <p className="mt-2 text-sm text-text-muted">
          Our team will be in touch with pricing.
        </p>
        <p className="mt-5 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-left text-sm leading-relaxed text-accent">
          Nothing was sent. Delivering this enquiry needs the backend and an
          email provider, both of which come later in the build.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="space-y-4 rounded-panel border border-border-base bg-surface p-6 shadow-card"
    >
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

      <button
        type="submit"
        className="h-11 w-full rounded-card bg-brand font-medium text-on-brand transition-colors hover:bg-brand-hover sm:w-auto sm:px-6"
      >
        Send enquiry
      </button>
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
