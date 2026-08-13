"use client";

import Link from "next/link";
import { useState } from "react";
import { formatAED, lineTotal, VAT_RATE } from "@/lib/money";
import { useStore } from "@/lib/store";

/**
 * Front-end only. Nothing is submitted anywhere yet — order creation, invoice
 * splitting per supplier and reference-number allocation are all backend work.
 * The form is real so the flow can be reviewed; the notice below is deliberate
 * and must stay until the API exists.
 */
export function CheckoutView() {
  const { lines, totals, ready, clearCart } = useStore();
  const [placed, setPlaced] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading&hellip;
      </div>
    );
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-lg rounded-panel border border-border-base bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text">Order preview complete</h2>
        <p className="mt-2 text-sm text-text-muted">Your reference number is</p>
        <p className="mt-1 text-xl font-semibold tracking-wide tnum text-text">
          {placed}
        </p>

        <p className="mt-5 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-left text-sm leading-relaxed text-accent">
          Nothing was submitted. This reference was generated in the browser so
          the flow can be reviewed &mdash; real orders, per-supplier invoices and
          confirmation emails arrive with the backend.
        </p>

        <Link
          href="/products"
          className="mt-6 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Back to catalogue
        </Link>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-medium text-text">Your cart is empty</h2>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const suppliers = new Set(lines.map((l) => l.product.supplierId));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Placeholder reference. The real one is allocated server-side so it is
        // unique and sequential — never generated in the browser.
        const seq = String(Math.floor(Math.random() * 900000) + 100000);
        setPlaced(`AM-PREVIEW-${seq}`);
        clearCart();
      }}
      className="grid gap-8 lg:grid-cols-[1fr_22rem]"
    >
      <div className="space-y-6">
        <p className="rounded-card border border-accent-border bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent">
          <strong>Front-end preview.</strong> This checkout does not submit an
          order or take payment. It exists so the flow and wording can be
          reviewed before the backend is built.
        </p>

        <fieldset className="rounded-panel border border-border-base bg-surface p-5 shadow-card">
          <legend className="px-1 text-sm font-semibold text-text">
            Delivery details
          </legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Clinic or company name" name="company" required />
            <Field label="Contact name" name="contact" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Phone" name="phone" type="tel" required />
            <Field
              label="Delivery address"
              name="address"
              required
              className="sm:col-span-2"
            />
            <Field label="Emirate" name="emirate" required />
            <Field label="Purchase order reference" name="po" />
          </div>
        </fieldset>

        <fieldset className="rounded-panel border border-border-base bg-surface p-5 shadow-card">
          <legend className="px-1 text-sm font-semibold text-text">Payment</legend>
          <label className="mt-3 flex items-start gap-3 rounded-card border border-brand-border bg-brand-soft p-3">
            <input
              type="radio"
              name="payment"
              value="offline"
              defaultChecked
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-text">
                Offline / Purchase order
              </span>
              <span className="mt-0.5 block text-sm text-text-muted">
                We&rsquo;ll invoice your account. Card and online payment are a
                later decision.
              </span>
            </span>
          </label>
        </fieldset>
      </div>

      <aside className="lg:sticky lg:top-40 lg:self-start">
        <div className="rounded-panel border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-semibold text-text">Order summary</h2>

          <ul className="mt-3 space-y-2 border-b border-border-base pb-3">
            {lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 text-text-muted">
                  <span className="tnum">{line.qty}</span> &times;{" "}
                  {line.product.name}
                </span>
                <span className="shrink-0 font-medium tnum text-text">
                  {formatAED(
                    lineTotal(line.product.priceAED, line.product.tiers, line.qty)
                  )}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Subtotal</dt>
              <dd className="font-medium tnum text-text">
                {formatAED(totals.subtotalAED)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted tnum">
                VAT ({Math.round(VAT_RATE * 100)}%)
              </dt>
              <dd className="font-medium tnum text-text">
                {formatAED(totals.vatAED)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border-base pt-3">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-lg font-semibold tnum text-text">
                {formatAED(totals.totalAED)}
              </dd>
            </div>
          </dl>

          {suppliers.size > 1 && (
            <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text-muted tnum">
              This order spans {suppliers.size} suppliers and will produce{" "}
              {suppliers.size} separate invoices under one reference number.
            </p>
          )}

          <button
            type="submit"
            className="mt-5 h-11 w-full rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover"
          >
            Place order
          </button>
        </div>
      </aside>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-text">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
      />
    </label>
  );
}
