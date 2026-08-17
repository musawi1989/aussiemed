import Link from "next/link";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { StatusPill } from "@/components/StatusPill";

const aed = (fils: number) => formatAED(fils / 100);
const when = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const daysAgo = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

/**
 * Everything a customer has asked for and not yet been answered — FN-02,
 * FN-03, FN-04.
 *
 * All three used to submit and reach nobody. Capture without somewhere to read
 * it would only have moved the problem, so this is the queue: quote requests
 * and bulk-buy enquiries oldest first, because the oldest unanswered enquiry is
 * the one costing the most, and the restock waitlist ranked by how many people
 * are waiting on the same pack.
 *
 * There is no email here yet. That is BE-05, and it sends from these rows when
 * it arrives.
 */
export default async function EnquiriesPage() {
  const [quotes, enquiries, waitlist] = await Promise.all([
    db.quoteRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
        items: {
          include: {
            sku: {
              select: {
                skuCode: true,
                unitLabel: true,
                priceFils: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    db.enquiry.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 50,
    }),
    db.notifySubscription.findMany({
      where: { notifiedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        sku: {
          select: {
            skuCode: true,
            unitLabel: true,
            manualOutOfStock: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const openQuotes = quotes.filter((q) => q.status === "New");
  const openEnquiries = enquiries.filter((e) => e.status === "New");

  /* Grouped by pack: fourteen clinics waiting on one item is a different
     conversation from fourteen people waiting on fourteen items. */
  const byPack = new Map<
    string,
    { name: string; productId: string; unitLabel: string; count: number; oldest: Date; outOfStock: boolean }
  >();
  for (const row of waitlist) {
    const key = row.sku.skuCode;
    const existing = byPack.get(key);
    if (existing) {
      existing.count++;
      if (row.createdAt < existing.oldest) existing.oldest = row.createdAt;
    } else {
      byPack.set(key, {
        name: row.sku.product.name,
        productId: row.sku.product.id,
        unitLabel: row.sku.unitLabel,
        count: 1,
        oldest: row.createdAt,
        outOfStock: row.sku.manualOutOfStock,
      });
    }
  }
  const packs = [...byPack.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">Enquiries</h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {openQuotes.length} quote request
          {openQuotes.length === 1 ? "" : "s"} &middot; {openEnquiries.length}{" "}
          bulk-buy enquir{openEnquiries.length === 1 ? "y" : "ies"} &middot;{" "}
          {waitlist.length} waiting on stock
        </p>
      </div>

      <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        Nothing here is emailed yet — that is BE-05. These are recorded so they
        can be answered by hand in the meantime, rather than lost on arrival as
        they were before.
      </p>

      {/* --- quote requests --- */}

      <h2 className="mt-8 text-base font-bold tracking-tight text-text">
        Quote requests
      </h2>
      {quotes.length === 0 ? (
        <Empty>No quote requests yet.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {quotes.map((quote) => {
            const listed = quote.items.reduce(
              (n, i) => n + i.sku.priceFils * i.qty,
              0
            );
            const age = daysAgo(quote.createdAt);
            return (
              <li
                key={quote.id}
                className={`rounded-card border bg-surface p-4 shadow-card ${
                  quote.status === "New" && age >= 2
                    ? "border-danger"
                    : "border-border-base"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold tnum text-navy">
                        {quote.reference}
                      </span>
                      <StatusPill axis="record" status={quote.status} />
                      {quote.status === "New" && age >= 2 && (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                          {age} days unanswered
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-text">
                      {quote.contactName} &middot;{" "}
                      <a
                        href={`mailto:${quote.contactEmail}`}
                        className="text-navy hover:underline"
                      >
                        {quote.contactEmail}
                      </a>
                    </p>
                    <p className="text-xs tnum text-text-subtle">
                      {when(quote.createdAt)} &middot; {quote.items.length} line
                      {quote.items.length === 1 ? "" : "s"} &middot; listed at{" "}
                      {aed(listed)}
                    </p>
                  </div>
                </div>

                <ul className="mt-2 space-y-0.5">
                  {quote.items.map((item) => (
                    <li key={item.id} className="text-sm text-text-muted">
                      <span className="font-bold tnum text-text">{item.qty}×</span>{" "}
                      <Link
                        href={`/admin/products/${item.sku.product.id}`}
                        className="hover:text-navy hover:underline"
                      >
                        {item.sku.product.name}
                      </Link>
                      <span className="text-xs text-text-subtle">
                        {" "}
                        {item.sku.unitLabel}
                      </span>
                    </li>
                  ))}
                </ul>

                {quote.notes && (
                  <p className="mt-2 rounded-card bg-surface-sunken px-3 py-2 text-sm text-text">
                    {quote.notes}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* --- bulk buy --- */}

      <h2 className="mt-8 text-base font-bold tracking-tight text-text">
        Bulk-buy enquiries
      </h2>
      {enquiries.length === 0 ? (
        <Empty>No bulk-buy enquiries yet.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {enquiries.map((enquiry) => {
            const age = daysAgo(enquiry.createdAt);
            return (
              <li
                key={enquiry.id}
                className={`rounded-card border bg-surface p-4 shadow-card ${
                  enquiry.status === "New" && age >= 2
                    ? "border-danger"
                    : "border-border-base"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-text">
                    {enquiry.company ?? enquiry.contactName}
                  </span>
                  <StatusPill axis="record" status={enquiry.status} />
                  {enquiry.status === "New" && age >= 2 && (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-bold text-danger">
                      {age} days unanswered
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-text">
                  {enquiry.contactName} &middot;{" "}
                  <a
                    href={`mailto:${enquiry.email}`}
                    className="text-navy hover:underline"
                  >
                    {enquiry.email}
                  </a>
                  {enquiry.phone ? ` · ${enquiry.phone}` : ""}
                </p>
                <p className="text-xs tnum text-text-subtle">
                  {when(enquiry.createdAt)}
                </p>
                <p className="mt-2 whitespace-pre-line rounded-card bg-surface-sunken px-3 py-2 text-sm text-text">
                  {enquiry.message}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {/* --- waitlist --- */}

      <h2 className="mt-8 text-base font-bold tracking-tight text-text">
        Waiting on stock
      </h2>
      {packs.length === 0 ? (
        <Empty>Nobody is waiting on a restock.</Empty>
      ) : (
        <ul className="mt-3 space-y-2">
          {packs.map(([skuCode, pack]) => (
            <li
              key={skuCode}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card"
            >
              <div className="min-w-0">
                <Link
                  href={`/admin/products/${pack.productId}`}
                  className="text-sm font-bold text-navy hover:underline"
                >
                  {pack.name}
                </Link>
                <p className="text-xs tnum text-text-subtle">
                  {skuCode} &middot; {pack.unitLabel} &middot; longest wait{" "}
                  {daysAgo(pack.oldest)} days
                  {!pack.outOfStock && " · back in stock, nobody told yet"}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent tnum">
                {pack.count} waiting
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
      {children}
    </p>
  );
}
