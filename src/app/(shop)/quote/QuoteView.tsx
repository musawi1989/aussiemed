"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { ProductThumb } from "@/components/ProductThumb";
import { QtyInput } from "@/components/QtyInput";
import { formatAED, lineTotal, round2 } from "@/lib/money";
import { useStore } from "@/lib/store";
import { quoteRequestAction, type EnquiryState } from "@/app/(shop)/enquiry-actions";

/**
 * Quote requests are indicative, not an order: we show the published price as a
 * reference but never a VAT line or a total to pay, because the whole point is
 * that the final number comes back from the sales team.
 *
 * FN-02: this used to resolve to a message on screen and discard the request.
 * It is now recorded with a reference the customer can quote back.
 */
export function QuoteView() {
  const { quoteLines, setQuoteQty, removeFromQuote, clearQuote, ready } =
    useStore();
  const [state, submit, pending] = useActionState<EnquiryState, FormData>(
    quoteRequestAction,
    null
  );

  const sent = state?.ok === true;

  /*
   * Emptied only once the request is safely stored — clearing on submit would
   * lose the list if the save failed.
   *
   * The ref is load-bearing, not defensive. clearQuote is a fresh function on
   * every render, so an effect depending on it re-runs after the state change
   * it causes, and the second run clears again, and so on: "maximum update
   * depth exceeded". Latching it means the clear happens exactly once.
   */
  const cleared = useRef(false);
  useEffect(() => {
    if (sent && !cleared.current) {
      cleared.current = true;
      clearQuote();
    }
  }, [sent, clearQuote]);

  if (!ready) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading&hellip;
      </div>
    );
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-lg rounded-panel border border-border-base bg-surface p-8 text-center shadow-card">
        <h2 className="text-lg font-semibold text-text">Quote request received</h2>
        {state?.ok && state.reference && (
          <p className="mt-2 text-2xl font-bold tracking-wide tnum text-navy">
            {state.reference}
          </p>
        )}
        <p className="mt-2 text-sm text-text-muted">
          Our team will come back to you with pricing on these lines. Quote that
          reference if you need to chase it.
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

  if (quoteLines.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-12 text-center">
        <h2 className="text-lg font-medium text-text">
          No lines on your quote request
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Use &ldquo;Add to quote request&rdquo; on any product to build up an
          enquiry.
        </p>
        <Link
          href="/products"
          className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Browse products
        </Link>
      </div>
    );
  }

  const indicative = round2(
    quoteLines.reduce(
      (sum, line) =>
        sum + lineTotal(line.pack.priceAED, line.pack.tiers, line.qty),
      0
    )
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div>
        <ul className="space-y-3">
          {quoteLines.map((line) => (
            <li
              key={`${line.productId}:${line.packId}`}
              className="rounded-panel border border-border-base bg-surface p-3 shadow-card"
            >
              <div className="flex gap-4">
                <ProductThumb
                  product={line.product}
                  sizes="80px"
                  size="sm"
                  className="h-20 w-20 shrink-0 rounded-card"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {line.product.brand && (
                        <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                          {line.product.brand}
                        </p>
                      )}
                      <h2 className="text-sm font-medium leading-snug text-text">
                        <Link
                          href={`/products/${line.product.slug}`}
                          className="hover:text-brand"
                        >
                          {line.product.name}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-xs text-text-subtle tnum">
                        {line.product.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromQuote(line.productId, line.packId)}
                      className="shrink-0 rounded-card px-2 py-1 text-xs text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <QtyInput
                      value={line.qty}
                      onChange={(qty) => setQuoteQty(line.productId, line.packId, qty)}
                      size="sm"
                    />
                    <p className="text-xs text-text-muted tnum">
                      Listed at{" "}
                      {formatAED(
                        lineTotal(line.pack.priceAED, line.pack.tiers, line.qty)
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-between">
          <Link
            href="/products"
            className="text-sm font-medium text-brand hover:underline"
          >
            &larr; Continue browsing
          </Link>
          <button
            type="button"
            onClick={clearQuote}
            className="text-sm text-text-muted hover:text-danger"
          >
            Clear quote request
          </button>
        </div>
      </div>

      <aside className="lg:sticky lg:top-32 lg:self-start">
        <form
          action={submit}
          className="rounded-panel border border-border-base bg-surface p-5 shadow-card"
        >
          {/* The lines travel with the request. They live in browser storage,
              so the server has no other way to know what was on the list. */}
          {quoteLines.map((line) => (
            <span key={`${line.productId}:${line.packId}`}>
              <input type="hidden" name="skuCode" value={line.pack.sku} />
              <input type="hidden" name="qty" value={line.qty} />
            </span>
          ))}
          <h2 className="text-base font-semibold text-text">Request pricing</h2>
          <p className="mt-1 text-sm text-text-muted tnum">
            {quoteLines.length} {quoteLines.length === 1 ? "line" : "lines"}
          </p>

          <dl className="mt-4 border-y border-border-base py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Listed total</dt>
              <dd className="font-medium tnum text-text">
                {formatAED(indicative)}
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed text-text-subtle">
            Indicative only, based on published prices. Your quoted price and
            any VAT are confirmed by our team.
          </p>

          <div className="mt-4 space-y-3">
            <Field label="Contact name" name="contact" required />
            <Field label="Email" name="email" type="email" required />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text">
                Notes
              </span>
              <textarea
                name="notes"
                rows={3}
                placeholder="Delivery timing, alternatives you'd accept, expected volumes"
                className="w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text placeholder:text-text-subtle"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="mt-4 h-11 w-full rounded-card bg-brand font-medium text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send quote request"}
          </button>

          {state?.ok === false && (
            <p role="alert" className="mt-3 text-sm font-semibold text-danger">
              {state.error}
            </p>
          )}
        </form>
      </aside>
    </div>
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
