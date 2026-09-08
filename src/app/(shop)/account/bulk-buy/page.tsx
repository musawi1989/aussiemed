import type { Metadata } from "next";
import Link from "next/link";
import { accountBulkBuyRequests } from "@/lib/account";
import { buyerProgress } from "@/lib/bulk-buy-requests";

export const metadata: Metadata = {
  title: "Bulk buy requests",
  description:
    "Every bulk price request on your account, what stage it is at, and what we came back with.",
};

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);

/**
 * What the buyer sent us, and what we said back.
 *
 * THE ANSWER USED TO LIVE ONLY IN AN EMAIL. A buyer who could not find the
 * price they were quoted in August asked for it again in November, and the
 * second answer was rarely the same as the first — different person, moved
 * costs, no record either side could point at. The reply is now written once
 * and shown in both places: the email as it always was, and here, against the
 * request it answers.
 *
 * IT ALSO SHOWS WHAT IS STILL OPEN, which is the other half of the same
 * problem. A request sent into silence gives a buyer no way to tell "they are
 * working on it" from "it never arrived", and the only way to find out is to
 * ring and ask — which is the call this page exists to save.
 *
 * THREE STATES, NOT TWO. The record carries Pending or Completed; what a buyer
 * needs to know is finer than that, because "Pending" cannot tell them whether
 * they are waiting on us or we are waiting on them. buyerProgress makes that
 * distinction, and it is tested.
 */
export default async function AccountBulkBuyPage() {
  const requests = await accountBulkBuyRequests();

  if (requests.length === 0) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center">
        <h2 className="text-lg font-bold text-text">
          No bulk buy requests yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
          Add the products and quantities you want to a request, send it, and we
          come back with pricing beyond the published breaks. Everything you
          send appears here with our answer.
        </p>
        <Link
          href="/bulk-buy"
          className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
        >
          How to build one
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-text">Bulk buy requests</h2>
        <Link
          href="/quote"
          className="text-sm font-bold text-navy hover:underline"
        >
          Start another &rarr;
        </Link>
      </div>

      <ul className="mt-5 space-y-4">
        {requests.map((request) => {
          const progress = buyerProgress(request);

          return (
            <li
              key={request.id}
              className="rounded-panel border border-border-base bg-surface p-5 shadow-card"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <span className="font-bold tnum text-text">
                    {request.reference}
                  </span>
                  <span className="ml-2 text-sm text-text-muted">
                    Sent {day(request.createdAt)}
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    !progress.open
                      ? "bg-surface-sunken text-text-subtle"
                      : progress.answered
                        ? "bg-navy-soft text-navy"
                        : "bg-accent-soft text-accent"
                  }`}
                >
                  {progress.headline}
                </span>
              </div>

              <p className="mt-1 text-sm text-text-muted">{progress.detail}</p>

              <ul className="mt-3 space-y-1 border-t border-border-base pt-3 text-sm">
                {request.items.map((item) => (
                  <li key={item.id} className="flex flex-wrap gap-x-2">
                    <span className="font-bold tnum text-text">{item.qty}</span>
                    <span className="text-text-muted">&times;</span>
                    <Link
                      href={`/products/${item.sku.product.slug}`}
                      className="text-text hover:text-navy hover:underline"
                    >
                      {item.sku.product.name}
                    </Link>
                    <span className="text-xs text-text-subtle">
                      {item.sku.unitLabel}
                    </span>
                  </li>
                ))}
              </ul>

              {request.notes && (
                <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-sm text-text">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                    What you told us
                  </span>
                  {request.notes}
                </p>
              )}

              {/* The answer, as written, against the request it answers. The
                  whole reason this page exists. */}
              {progress.answered && (
                <div className="mt-3 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-navy">
                    Our answer
                    {request.answeredAt ? ` · ${day(request.answeredAt)}` : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text">
                    {request.replyToCustomer}
                  </p>
                </div>
              )}

              {progress.open && progress.answered && (
                <p className="mt-3 text-xs text-text-subtle">
                  Happy with it? Add the products to your cart and check out, or
                  reply to our email and we will take it from there.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
