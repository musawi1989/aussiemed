"use client";

import Link from "next/link";
import { useState } from "react";
import { aed, useCart } from "@/lib/cart-client";
import { formatAED } from "@/lib/money";

/**
 * Places a real order.
 *
 * The reference number comes back from the server, which allocates it inside
 * the same transaction that writes the order — the browser never invents one.
 */
export type CheckoutBranch = {
  id: string;
  label: string;
  line1: string;
  city: string;
  contact: string;
  phone: string;
  emirate: string;
  isDefault: boolean;
};

export function CheckoutView({
  branches = [],
  staff = [],
}: {
  branches?: CheckoutBranch[];
  staff?: { id: string; name: string }[];
}) {
  const { cart, ready, refresh } = useCart();
  const [placed, setPlaced] = useState<{
    reference: string;
    totalAED: number;
  } | null>(null);

  // Pre-selecting the default branch fills the address for the common case:
  // a practice with one site should not retype it every time.
  const [branchId, setBranchId] = useState(
    branches.find((b) => b.isDefault)?.id ?? branches[0]?.id ?? ""
  );
  const branch = branches.find((b) => b.id === branchId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) {
    return (
      <div className="rounded-card border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading&hellip;
      </div>
    );
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-lg rounded-card border border-border-base bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>

        <h2 className="mt-4 text-lg font-bold text-text">Order placed</h2>
        <p className="mt-2 text-sm text-text-muted">Your reference number is</p>
        <p className="mt-1 text-2xl font-bold tracking-wide tnum text-navy">
          {placed.reference}
        </p>

        {/* One invoice, from AussieMed — DEC-22. The customer used to be told
            how many supplier invoices their order would produce, which both
            revealed that suppliers exist and is no longer true. */}
        <p className="mt-4 text-sm text-text-muted tnum">
          {formatAED(placed.totalAED)}
        </p>

        <p className="mt-5 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-left text-sm leading-relaxed text-accent">
          The order is saved. Confirmation emails and payment are not built yet,
          so nobody has been notified and nothing has been charged.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/orders/${placed.reference}`}
            className="rounded-card bg-navy px-5 py-2.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover"
          >
            View order
          </Link>
          <Link
            href="/products"
            className="rounded-card border border-border-strong px-5 py-2.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Back to catalogue
          </Link>
        </div>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="rounded-card border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-bold text-text">Your cart is empty</h2>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-red px-5 py-2.5 text-sm font-bold text-on-red transition-colors hover:bg-red-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/v1/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not place the order");
        // A line may have gone out of stock while the form was open.
        await refresh();
        return;
      }
      setPlaced(data);
      await refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {error && (
          <p className="rounded-card border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Only for a trade account that has set these up. An empty picker is
            worse than none, so neither appears until there is something in it. */}
        {(branches.length > 0 || staff.length > 0) && (
          <fieldset className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <legend className="px-1 text-sm font-bold text-text">
              This order is for
            </legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {branches.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text">
                    Branch
                  </span>
                  <select
                    name="addressId"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                        {b.city ? ` — ${b.city}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-text-subtle">
                    Keeps each site&rsquo;s ordering separate on your account.
                  </span>
                </label>
              )}

              {staff.length > 0 && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-text">
                    Ordered by
                  </span>
                  <select
                    name="staffId"
                    className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
                  >
                    <option value="">Not specified</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-text-subtle">
                    Their name goes on the order.
                  </span>
                </label>
              )}
            </div>
          </fieldset>
        )}

        <fieldset className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <legend className="px-1 text-sm font-bold text-text">
            Delivery details
          </legend>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Clinic or company name" name="company" required />
            <Field
              label="Contact name"
              name="contact"
              required
              defaultValue={branch?.contact}
              key={`contact-${branchId}`}
            />
            <Field label="Email" name="email" type="email" required />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              required
              defaultValue={branch?.phone}
              key={`phone-${branchId}`}
            />
            <Field
              label="Delivery address"
              name="line1"
              required
              className="sm:col-span-2"
              defaultValue={branch?.line1}
              key={`line1-${branchId}`}
            />
            <Field
              label="Emirate"
              name="emirate"
              required
              defaultValue={branch?.emirate}
              key={`emirate-${branchId}`}
            />
            <Field label="Purchase order reference" name="poReference" />
          </div>
        </fieldset>

        <fieldset className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <legend className="px-1 text-sm font-bold text-text">Payment</legend>
          <label className="mt-3 flex items-start gap-3 rounded-card border border-navy-border bg-navy-soft p-3">
            <input type="radio" name="paymentMethod" value="OfflinePurchaseOrder" defaultChecked className="mt-0.5" />
            <span>
              <span className="block text-sm font-bold text-text">
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
        <div className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <h2 className="text-base font-bold text-text">Order summary</h2>

          <ul className="mt-3 space-y-2 border-b border-border-base pb-3">
            {cart.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0 text-text-muted">
                  <span className="tnum">{line.qty}</span> &times;{" "}
                  {line.productName}
                </span>
                <span className="shrink-0 font-bold tnum text-text">
                  {formatAED(aed(line.lineTotalFils))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Subtotal</dt>
              <dd className="font-bold tnum text-text">
                {formatAED(aed(cart.subtotalFils))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">VAT</dt>
              <dd className="font-bold tnum text-text">
                {formatAED(aed(cart.vatFils))}
              </dd>
            </div>
            <div className="flex justify-between border-t border-border-base pt-3">
              <dt className="font-bold text-text">Total</dt>
              <dd className="text-lg font-bold tnum text-text">
                {formatAED(aed(cart.totalFils))}
              </dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 h-11 w-full rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
          >
            {submitting ? "Placing order…" : "Place order"}
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
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  className?: string;
  /** Prefilled from the chosen branch. Remounted on change via a key, so
   *  switching branch refills the field instead of leaving a stale value. */
  defaultValue?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-bold text-text">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
      />
    </label>
  );
}
