"use client";

import { useActionState } from "react";
import { notifyMeAction, type EnquiryState } from "@/app/(shop)/enquiry-actions";

/**
 * Out-of-stock products swap Add to Cart for this — FN-04.
 *
 * It used to set a flag in the browser and say "we'll email you when it's back
 * in stock", which was a promise the system could not keep: nothing was
 * recorded anywhere. The request is now stored against the pack, so the person
 * who restocks can see who is waiting, and the restock mailer sends from those
 * rows when BE-05 arrives.
 *
 * The wording is careful. Until the mailer exists, saying we will email is
 * still a promise, so it says what is actually true: the request is recorded.
 */
export function NotifyMe({
  productName,
  skuCode,
}: {
  productName: string;
  skuCode: string;
}) {
  const [state, submit, pending] = useActionState<EnquiryState, FormData>(
    notifyMeAction,
    null
  );

  if (state?.ok) {
    return (
      <p className="rounded-card border border-success bg-success-soft px-3 py-2 text-sm text-success">
        Noted — you are on the list for {productName}. We will be in touch when
        it is back.
      </p>
    );
  }

  return (
    <form action={submit} className="flex flex-wrap gap-2">
      <input type="hidden" name="skuCode" value={skuCode} />
      <input
        type="email"
        name="email"
        required
        placeholder="you@clinic.ae"
        aria-label={`Email address for ${productName} restock alert`}
        className="h-10 min-w-0 flex-1 rounded-card border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-10 shrink-0 rounded-card border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
      >
        {pending ? "Saving…" : "Notify me"}
      </button>
      {state?.ok === false && (
        <p role="alert" className="w-full text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
