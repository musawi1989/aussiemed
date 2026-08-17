"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CountryFields } from "@/components/CountryFields";
import { MIN_PASSWORD, OTP_LENGTH, OTP_MINUTES } from "@/lib/registration";
import { applyAction, resendAction, verifyAction } from "./actions";
import type { FormState } from "@/components/AdminForm";

const field =
  "h-11 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text focus:border-navy focus:outline-none";
const label = "mb-1 block text-sm font-bold text-text";

/**
 * Opening a trade account, in two steps and no more.
 *
 * Step one asks for what is needed to decide; step two proves the address
 * reaches them. It is not a wizard: everything on step one is on one screen,
 * because a business filling in an application wants to see what is being
 * asked before starting, and a four-page form gets abandoned on page three.
 *
 * What the applicant is told, plainly and twice: this is an application, an
 * account is not open yet, and somebody will decide. A customer who believes
 * they have an account and then cannot sign in has been misled by us.
 */
export function SignUpFlow({
  googleEnabled,
  /**
   * An address that has applied but not confirmed, arriving as ?verify= from
   * the sign-in page. Somebody who closed the tab before entering their code
   * has to be able to come back to it — without this the sign-in error links
   * to a fresh application form, and re-applying is not what they need.
   */
  verifyEmail,
}: {
  googleEnabled: boolean;
  verifyEmail?: string;
}) {
  const [applyState, apply, applying] = useActionState<FormState, FormData>(
    applyAction,
    null
  );

  // The service returns the address it wrote to, which is what step two needs.
  const justApplied =
    applyState?.ok === true && applyState.message?.startsWith("check-email:");
  const email = justApplied
    ? applyState.message!.slice("check-email:".length)
    : (verifyEmail ?? "");

  if (email) return <VerifyStep email={email} />;

  return (
    <div className="rounded-card border border-border-base bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-text">
        Open a trade account
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        AussieMed supplies businesses, so accounts are opened by a person rather
        than automatically. Fill this in and we will confirm your email, then
        review the application — usually within one working day.
      </p>

      {googleEnabled && (
        <>
          <a
            href="/api/v1/auth/google?intent=signup"
            className="mt-5 flex h-11 items-center justify-center gap-2 rounded-card border border-border-strong bg-surface text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Continue with Google
          </a>
          <p className="mt-1.5 text-xs text-text-subtle">
            Google confirms your email for us, so you skip the code. We still
            need your company details and TRN, and it is still subject to
            approval.
          </p>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border-base" />
            <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
              or
            </span>
            <span className="h-px flex-1 bg-border-base" />
          </div>
        </>
      )}

      <form action={apply} className={googleEnabled ? "" : "mt-5"}>
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-bold uppercase tracking-wide text-text-subtle">
            Your business
          </legend>

          <label className="block">
            <span className={label}>Practice or company name</span>
            <input name="companyName" required className={field} />
          </label>

          <label className="block">
            <span className={label}>Tax Registration Number</span>
            <input
              name="trn"
              required
              inputMode="numeric"
              placeholder="100 123 456 700 003"
              className={`${field} tnum`}
            />
            {/* Asked now rather than later on purpose: without it we cannot
                issue a compliant tax invoice, and adding it after the first
                order means reissuing every document sent in between. */}
            <span className="mt-1 block text-xs text-text-subtle">
              15 digits, from your VAT certificate. We need it to invoice you
              correctly from your first order.
            </span>
          </label>
        </fieldset>

        <fieldset className="mt-6 space-y-4">
          <legend className="mb-3 text-xs font-bold uppercase tracking-wide text-text-subtle">
            You
          </legend>

          <label className="block">
            <span className={label}>Your name</span>
            <input name="contactName" required className={field} />
          </label>

          <label className="block">
            <span className={label}>Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className={field}
            />
            <span className="mt-1 block text-xs text-text-subtle">
              We send a {OTP_LENGTH}-digit code here to confirm it.
            </span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <CountryFields
              inputClassName={field}
              labelClassName={label}
              required
            />
          </div>

          <label className="block">
            <span className={label}>Choose a password</span>
            <input
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              className={field}
            />
            <span className="mt-1 block text-xs text-text-subtle">
              At least {MIN_PASSWORD} characters. A short phrase you will
              remember beats a short word with symbols in it.
            </span>
          </label>
        </fieldset>

        {applyState?.ok === false && applyState.error && (
          <p
            role="alert"
            className="mt-5 rounded-card border border-danger bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
          >
            {applyState.error}
          </p>
        )}

        <p className="mt-5 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2.5 text-sm text-text">
          <span className="font-bold">This is an application.</span> Sending it
          does not open an account — we will email you as soon as it has been
          reviewed, and you can order from that moment.
        </p>

        <button
          type="submit"
          disabled={applying}
          className="mt-4 h-11 w-full rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {applying ? "Sending…" : "Send application"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-bold text-navy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * Step two: the code.
 *
 * The address is shown back, because the commonest reason a code never arrives
 * is that it went somewhere else. Re-sending is offered from the start rather
 * than after a failure — the email may simply not have arrived, and hunting
 * for a way to try again is the point at which people give up.
 */
function VerifyStep({ email }: { email: string }) {
  const [state, verify, verifying] = useActionState<FormState, FormData>(
    verifyAction,
    null
  );
  const [resendState, resend, resending] = useActionState<FormState, FormData>(
    resendAction,
    null
  );
  const [done, setDone] = useState(false);

  if (state?.ok === true || done) {
    return (
      <div className="rounded-card border border-border-base bg-surface p-6 text-center shadow-card">
        <p className="text-3xl" aria-hidden="true">
          ✔
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-text">
          Email confirmed
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
          Your application is with our team. We will email you as soon as it is
          approved — usually within one working day — and you can place your
          first order from then.
        </p>
        <p className="mx-auto mt-3 max-w-sm text-sm text-text-muted">
          You cannot sign in until it is approved. Nothing more is needed from
          you in the meantime.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Have a look at the range
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border-base bg-surface p-6 shadow-card">
      <h1 className="text-xl font-bold tracking-tight text-text">
        Confirm your email
      </h1>
      <p className="mt-1.5 text-sm leading-relaxed text-text-muted">
        We sent a {OTP_LENGTH}-digit code to{" "}
        <span className="font-bold text-text">{email}</span>. It works for{" "}
        {OTP_MINUTES} minutes.
      </p>

      <form action={verify} onSubmit={() => setDone(false)} className="mt-5">
        <input type="hidden" name="email" value={email} />
        <label className="block">
          <span className={label}>Your code</span>
          <input
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            placeholder="123456"
            className={`${field} tnum text-center text-lg tracking-[0.4em]`}
          />
        </label>

        {state?.ok === false && state.error && (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger bg-danger-soft px-3 py-2 text-sm font-semibold text-danger"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={verifying}
          className="mt-5 h-11 w-full rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {verifying ? "Checking…" : "Confirm email"}
        </button>
      </form>

      <form action={resend} className="mt-4 text-center">
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={resending}
          className="text-sm font-bold text-navy hover:underline disabled:opacity-60"
        >
          {resending ? "Sending…" : "Send a new code"}
        </button>
        {resendState?.ok === true && (
          <p role="status" className="mt-1.5 text-xs text-text-muted">
            {resendState.message}
          </p>
        )}
      </form>
    </div>
  );
}
