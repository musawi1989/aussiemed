"use client";

import Link from "next/link";
import { CountryFields } from "@/components/CountryFields";
import { LineSaving } from "@/components/LineSaving";
import { orderDiscount, sourceLabel } from "@/lib/order-discounts";
import { useState } from "react";
import { aed, useCart } from "@/lib/cart-client";
import { formatAED } from "@/lib/money";
import {
  CARD_PAYMENT_AVAILABLE,
  cardFeeDescription,
  cardFeeFils,
  dueWording,
  paymentDueOn,
  totalWithCardFeeFils,
} from "@/lib/payment-options";

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
  countryCode: string;
  isDefault: boolean;
};

export function CheckoutView({
  branches = [],
  staff = [],
  company = "",
  email = "",
  contactName = "",
  phone = "",
  emirate = "",
  countryCode = "",
  paymentTerms = "Prepaid",
  signedIn = false,
}: {
  branches?: CheckoutBranch[];
  staff?: { id: string; name: string }[];
  /*
   * What the account already tells us, prefilled for a signed-in buyer and
   * empty for a guest, who types it.
   *
   * ALL OF IT STAYS EDITABLE. Prefilling is a convenience, not an assertion:
   * a clinic ordering for a sister site, or sending one delivery to a
   * different contact, should not have to fight a locked field. The server
   * takes what is submitted — see the checkout route, which reads the body
   * rather than re-reading the account.
   *
   * These are the FALLBACK beneath the selected branch, not a replacement for
   * it. A branch is the address goods actually go to and wins wherever it has
   * a value; this is what fills the form for an account that has never saved
   * one, which used to leave contact, phone, country and emirate blank.
   */
  company?: string;
  email?: string;
  contactName?: string;
  phone?: string;
  emirate?: string;
  countryCode?: string;
  /** This account's agreed terms. A guest is Prepaid. */
  paymentTerms?: string;
  signedIn?: boolean;
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

  /*
   * What the two payment options cost this buyer, on this order.
   *
   * Computed after the loading guard so cart totals are real rather than zero,
   * and computed from payment-options.ts so the fee quoted here is produced by
   * the same function that will charge it once Stripe is connected. A figure
   * on a checkout screen that a later implementation recalculates differently
   * is how a customer ends up disputing a card statement.
   *
   * Dubai time, because that is where the buyer and the invoice both are, and
   * a due date that lands a day early in a browser set to London is a due date
   * somebody chases early.
   */
  const settleBy = paymentDueOn(paymentTerms, new Date()).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" }
  );
  const cardFee = cardFeeFils(cart.totalFils);
  const due = dueWording(paymentTerms, settleBy);
  // What this account's terms take off, split by where it came from. The same
  // function reads the order back on the invoice afterwards.
  const saved = orderDiscount(cart.lines);

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
            <Field
              label="Clinic or company name"
              name="company"
              required
              defaultValue={company}
            />
            <Field
              label="Contact name"
              name="contact"
              required
              defaultValue={branch?.contact || contactName}
              key={`contact-${branchId}`}
            />
            <Field
              label="Email"
              name="email"
              type="email"
              required
              defaultValue={email}
            />
            <Field
              label="Delivery address"
              name="line1"
              required
              className="sm:col-span-2"
              defaultValue={branch?.line1}
              key={`line1-${branchId}`}
            />
            {/* Keyed on the branch like the fields above it: choosing a
                different branch must reload the country and the number with
                it, or the address belongs to one site and the phone to
                another. */}
            <CountryFields
              key={`where-${branchId}`}
              countryCode={branch?.countryCode || countryCode || undefined}
              subdivision={branch?.emirate || emirate || undefined}
              phone={branch?.phone || phone || undefined}
              required
              /* The same strings the Field below this uses. They used to be the
                 admin forms' styles, borrowed: uppercase grey labels over 38px
                 boxes, directly above a normal-case bold label over a 40px one.
                 Country, Emirate and Phone now match Purchase order reference,
                 which is the field they sit next to. */
              inputClassName="h-10 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
              labelClassName="mb-1 block text-sm font-bold text-text"
            />
            <Field label="Purchase order reference" name="poReference" />
          </div>
        </fieldset>

        <fieldset className="rounded-card border border-border-base bg-surface p-5 shadow-card">
          <legend className="px-1 text-sm font-bold text-text">Payment</legend>

          {/*
            Two options, and only one of them can actually take money today.
            The card option is shown anyway, priced against THIS order, because
            a buyer weighing up whether to open an account should be able to see
            what the alternative costs before choosing — not after Stripe is
            wired in and the total changes under them.
          */}
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-card border border-navy-border bg-navy-soft p-3">
            <input
              type="radio"
              name="paymentMethod"
              value="OfflinePurchaseOrder"
              defaultChecked
              className="mt-0.5 cursor-pointer"
            />
            <span>
              <span className="block text-sm font-bold text-text">
                On account
              </span>
              <span className="mt-1 block text-sm text-text-muted">
                We confirm the order and invoice you, then dispatch it. Nothing
                is taken now, and there is no card fee.
              </span>
              {/* This buyer's own arrangement and the date it produces, not the
                  house default. Asserting "two weeks" at an account agreed on
                  Net30 would be telling them their invoice is due a fortnight
                  before it is — and naming the terms as well as the date means
                  a change made in the admin screen shows up here as the words
                  the buyer was given, rather than only as a date that moved. */}
              <span className="mt-2 block rounded-card bg-surface px-3 py-2 text-sm text-text">
                {signedIn && (
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-text-subtle">
                    Your payment terms: {due.arrangement}
                  </span>
                )}
                <span className="font-bold">{due.headline}</span>
                <span className="block text-text-muted">{due.detail}</span>
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-text-subtle">
                {signedIn
                  ? "Your invoice is issued when we confirm the order, and settles against this account. Terms are set when your account is approved and can be changed by arrangement — what is shown above is what your account is on today."
                  : "Account terms are agreed when your trade account is approved. Until then we confirm and invoice an order before it ships."}
              </span>
            </span>
          </label>

          <label
            className={`mt-3 flex items-start gap-3 rounded-card border border-border-base p-3 ${
              CARD_PAYMENT_AVAILABLE ? "cursor-pointer" : "cursor-not-allowed bg-surface-sunken"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value="Card"
              disabled={!CARD_PAYMENT_AVAILABLE}
              className="mt-0.5 disabled:cursor-not-allowed"
            />
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-text">Card</span>
                {!CARD_PAYMENT_AVAILABLE && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                    Not available yet
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-text-muted">
                Pay by card through Stripe. We are not connected to Stripe yet,
                so this cannot be selected today.
              </span>
              {/* Priced against this order rather than described in the
                  abstract: "2.9% + AED 1.00" is a rate, and what a buyer wants
                  to know is what it costs them on what is in front of them. */}
              <span className="mt-2 block rounded-card border border-border-base bg-surface px-3 py-2 text-sm">
                <span className="block text-text">
                  <span className="font-bold">Card fee {cardFeeDescription()}</span>
                  <span className="text-text-muted">
                    {" "}&mdash; {formatAED(aed(cardFee))} on this order.
                  </span>
                </span>
                <span className="mt-1 block text-text-muted">
                  Total by card would be{" "}
                  <span className="font-bold tnum text-text">
                    {formatAED(aed(totalWithCardFeeFils(cart.totalFils)))}
                  </span>
                </span>
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-text-subtle">
                The card fee is added to your total and paid by you &mdash;
                AussieMed does not absorb it. Paying on account avoids it
                entirely.
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
                  {/* Why this line is cheaper than the listed price, on the
                      line itself — a buyer checking one product against a
                      quote should not have to work it out from the totals. */}
                  <LineSaving
                    line={line}
                    accountBasisPoints={cart.accountDiscountBasisPoints}
                    struck
                    className="ml-1.5 text-xs"
                  />
                </span>
                <span className="shrink-0 font-bold tnum text-text">
                  {formatAED(aed(line.lineTotalFils))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-2.5 text-sm">
            {/* WHAT IT WOULD HAVE COST, then what came off, then what it is.
                A subtotal that is already net of a discount, with no sign of
                the discount, is a saving the buyer was given and never told
                about — and the first they would hear of it is a colleague
                asking why the invoice does not match the website. */}
            {saved.discounted && saved.listSubtotalFils !== null && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Subtotal at list</dt>
                <dd className="tnum text-text-muted">
                  {formatAED(aed(saved.listSubtotalFils))}
                </dd>
              </div>
            )}

            {saved.sources.map((source) =>
              saved.savingBySource[source] > 0 ? (
                <div key={source} className="flex justify-between">
                  <dt className="text-accent">
                    {sourceLabel(
                      source,
                      source === "AccountDiscount"
                        ? cart.accountDiscountBasisPoints
                        : undefined
                    )}
                  </dt>
                  <dd className="font-bold tnum text-accent">
                    &minus;{formatAED(aed(saved.savingBySource[source]))}
                  </dd>
                </div>
              ) : null
            )}

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
