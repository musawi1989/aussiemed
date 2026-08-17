"use client";

import Link from "next/link";
import { useActionState } from "react";
import { emailMyInvoiceAction } from "@/app/(shop)/account/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * What a buyer wants to do with an invoice: read it, print it, or send it on.
 *
 * All three sit on the order row rather than behind it. Getting an invoice out
 * of this site used to mean going to Spending, finding the right month, and
 * finding the reference in a list — three steps to reach a document that
 * belongs to the order you were already looking at.
 *
 * "Print" is the same page as "Invoice" and does not get its own button. The
 * browser's print dialogue is what makes the PDF, and a second button that
 * opens the same page and then calls print() is a button that behaves
 * differently depending on whether JavaScript has loaded.
 *
 * Emailing takes no address: it goes to the account's own. The printable page
 * is right there for forwarding, and a destination box would turn this into a
 * way to post somebody else's invoice anywhere.
 */
export function InvoiceActions({
  reference,
  compact = false,
}: {
  reference: string;
  /** Past orders show a tighter row — there is less to say about them. */
  compact?: boolean;
}) {
  const [state, submit, sending] = useActionState<FormState, FormData>(
    emailMyInvoiceAction,
    null
  );

  const button = compact
    ? "rounded-card border border-border-strong bg-surface px-2.5 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
    : "rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/account/invoices/${reference}`} className={button}>
        Invoice
      </Link>

      <form action={submit} className="inline-flex items-center gap-2">
        <input type="hidden" name="reference" value={reference} />
        <button type="submit" disabled={sending} className={`${button} disabled:opacity-60`}>
          {sending ? "Sending…" : "Email it to me"}
        </button>
      </form>

      {state?.ok === true && (
        <span role="status" className="text-xs font-semibold text-success">
          {state.message}
        </span>
      )}
      {state?.ok === false && state.error && (
        <span role="alert" className="text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </div>
  );
}
