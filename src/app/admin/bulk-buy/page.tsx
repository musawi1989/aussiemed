import { ProductThumbnail } from "@/components/ProductThumbnail";
import { EntityLogo } from "@/components/EntityLogo";
import { clientKey } from "@/lib/client-grouping";
import Link from "next/link";
import { formatAED } from "@/lib/money";
import { listBulkBuyRequests } from "@/lib/bulk-buy-admin";
import { isOpen, normaliseStatus } from "@/lib/bulk-buy-requests";
import { BulkBuyStatusToggle } from "@/components/admin/BulkBuyStatusToggle";
import { QuoteReply } from "@/components/admin/QuoteReply";

const aed = (fils: number) => formatAED(fils / 100);
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
const daysAgo = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

export const metadata = { title: "Bulk buy requests" };

/**
 * Bulk buy requests — the one queue, in its own section.
 *
 * THERE USED TO BE TWO OF THESE, both buried at the bottom of Needs attention:
 * "Quote requests" and "Bulk-buy enquiries". They were the same conversation
 * arriving through two doors — one carrying pack codes we could price, one
 * carrying free text somebody had to interpret — and having two of them meant
 * two queues to remember, two sets of wording, and a customer picking between
 * them with no way to know the difference. They are now one thing with one
 * name, and it has a place in the sidebar rather than a heading halfway down
 * somebody else's page.
 *
 * OPEN FIRST, OLDEST FIRST. The oldest unanswered request is the one costing
 * the most, and the completed ones stay on the page rather than disappearing —
 * "what did we quote them in August" is the question this screen gets asked
 * most, and an archive that has to be gone looking for is one nobody looks in.
 *
 * ANSWERING AND FINISHING ARE SEPARATE. The reply box sends a price; the
 * button beside it says the conversation is over. Tying them together is what
 * the old "Quoted" status did, and it emptied the queue at the moment a price
 * went back — which is the middle of the conversation.
 */
export default async function BulkBuyRequestsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams;
  const allRequests = await listBulkBuyRequests();
  if (!client) {
    const clients = [...Map.groupBy(allRequests, clientKey).entries()];
    return <div><h1 className="text-xl font-bold">Bulk buy requests by client</h1><ul className="mt-5 space-y-3">{clients.map(([key, rows]) => { const first = rows[0]; const name = first.organisation?.name ?? first.contactName; return <li key={key}><Link href={`/admin/bulk-buy?client=${encodeURIComponent(key)}`} className="flex items-center justify-between rounded-card border border-border-base p-4 hover:border-navy"><span className="font-bold"><EntityLogo kind={first.organisationId ? "organisation" : "user"} id={first.organisationId ?? first.userId} name={name} />{name}</span><span>{rows.length} requests · {rows.filter(r => isOpen(r.status)).length} open</span></Link></li>; })}</ul>{!clients.length && <p className="mt-4">No bulk buy requests yet.</p>}</div>;
  }
  const requests = allRequests.filter(request => clientKey(request) === client);

  const open = requests.filter((request) => isOpen(request.status));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Bulk buy requests
        </h1>
        <p className="text-sm text-text-muted">
          <span className="font-bold tnum text-text">{open.length}</span> open
          {requests.length > open.length && (
            <>
              {" "}
              &middot;{" "}
              <span className="tnum">{requests.length - open.length}</span>{" "}
              completed
            </>
          )}
        </p>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-text-muted">
        A buyer builds these from the catalogue, so every line names a real pack
        at a real quantity. Your answer is emailed to them word for word when
        you tick the box, and it also appears on their own account panel — so
        they can read back what we quoted without asking us again.
      </p>

      {requests.length === 0 ? (
        <p className="mt-8 rounded-card border border-border-base bg-surface-sunken px-4 py-8 text-center text-sm text-text-muted">
          No bulk buy requests yet. They arrive when a buyer adds products to a
          request on the storefront and sends it.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {requests.map((request) => {
            const status = normaliseStatus(request.status);
            const answered = Boolean(request.replyToCustomer?.trim());
            const age = daysAgo(request.createdAt);

            return (
              <li
                key={request.id}
                className={`rounded-card border bg-surface p-4 shadow-card ${
                  isOpen(request.status)
                    ? "border-border-base"
                    : "border-border-base opacity-75"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0">
                    <span className="font-bold tnum text-text">
                      {request.reference}
                    </span>
                    <span className="ml-2 text-sm text-text-muted">
                      {request.organisation?.name ?? request.contactName}
                    </span>
                    <span className="ml-2 text-xs text-text-subtle">
                      {request.contactEmail}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        status === "Completed"
                          ? "bg-surface-sunken text-text-subtle"
                          : answered
                            ? "bg-navy-soft text-navy"
                            : "bg-accent-soft text-accent"
                      }`}
                    >
                      {status === "Completed"
                        ? "Completed"
                        : answered
                          ? "Answered · open"
                          : "Pending"}
                    </span>
                    <span className="text-xs text-text-subtle">
                      {when(request.createdAt)}
                      {isOpen(request.status) && age > 0
                        ? ` · ${age} day${age === 1 ? "" : "s"} old`
                        : ""}
                    </span>
                  </div>
                </div>

                {request.organisation && (
                  <Link
                    href={`/admin/customers/${request.organisation.id}`}
                    className="mt-1 inline-block text-xs font-bold text-navy hover:underline"
                  >
                    <EntityLogo kind="organisation" id={request.organisation.id} />Open the account
                  </Link>
                )}

                <ul className="mt-3 space-y-1 border-t border-border-base pt-3 text-sm">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <span className="min-w-0 text-text">
                        <span className="font-bold tnum">{item.qty}</span>
                        {" × "}
                        <Link
                          href={`/admin/products/${item.sku.product.id}`}
                          className="hover:text-navy hover:underline"
                        >
                          <ProductThumbnail skuCode={item.sku.skuCode} />{item.sku.product.name}
                        </Link>
                        <span className="ml-1.5 text-xs text-text-subtle tnum">
                          {item.sku.skuCode} &middot; {item.sku.unitLabel}
                        </span>
                      </span>
                      {/* List price for reference only. What they are quoted is
                          whatever gets written in the answer — this is here so
                          nobody has to open the product to know roughly where
                          the conversation starts. */}
                      <span className="shrink-0 text-xs text-text-subtle tnum">
                        list {aed(item.sku.priceFils)}
                      </span>
                    </li>
                  ))}
                </ul>

                {request.notes && (
                  <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-sm text-text">
                    <span className="block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                      Notes and requests
                    </span>
                    {request.notes}
                  </p>
                )}

                <QuoteReply
                  quoteId={request.id}
                  contactEmail={request.contactEmail}
                  reply={request.replyToCustomer}
                  answeredBy={request.answeredByName}
                  answeredAt={request.answeredAt?.toISOString() ?? null}
                />

                <div className="mt-3 border-t border-border-base pt-3">
                  <BulkBuyStatusToggle
                    requestId={request.id}
                    status={status}
                    completedBy={request.completedByName}
                    completedAt={request.completedAt?.toISOString() ?? null}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
