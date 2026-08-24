import type { Metadata } from "next";
import Link from "next/link";
import { OrderProgress } from "@/components/OrderProgress";
import { StatusPill } from "@/components/StatusPill";
import { UrlFilters } from "@/components/UrlFilters";
import { InvoiceActions } from "@/components/account/InvoiceActions";
import { formatAED } from "@/lib/money";
import {
  isOpenOrder,
  splitDeliveryNote,
} from "@/lib/order-progress";
import {
  PERIODS,
  filterOrders,
  hasActiveFilters,
  paymentOptions,
  statusOptions,
} from "@/lib/order-filters";
import { deliveryStatusOf, paymentStatusOf } from "@/lib/status-tone";
import { accountBranches, accountOrders, accountSession } from "@/lib/account";

export const metadata: Metadata = {
  title: "Your orders",
  description:
    "Track the AussieMed orders you have open, filter by status or payment, and open any invoice.",
};

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Orders: the tracking view and the ledger, on one screen.
 *
 * Open orders come first with their progress shown, because that is the
 * question someone opens this page to answer — a date and a status word do not
 * say when the gloves arrive.
 *
 * BELOW THEM IS EVERY ORDER, WITH ITS MONEY. That table used to live on
 * Spending as "Your invoices" and moved here on 23 Aug 2026 at the client's
 * request. It belongs here: Spending answers "what did we spend", which is a
 * question about totals, and a list of individual references with a link to
 * each invoice is a question about orders. The same table on the wrong tab
 * meant someone chasing one invoice had to go to the reports screen to find
 * it.
 *
 * The two are not duplicates of each other. The cards track the few orders
 * still moving; the table is the record of all of them, with net, VAT and the
 * invoice. An order in progress appears in both, and should.
 *
 * FILTERS ARE IN THE URL, in the shape the client's operations tool uses
 * (DEC-20): search, status, payment, branch, period. Every one of them narrows
 * both sections, so the counts at the top and the rows below can never
 * disagree about what is being looked at.
 */
export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string;
    q?: string;
    status?: string;
    payment?: string;
    period?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await accountSession();

  if (!session) {
    return (
      <div className="rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
        <h2 className="text-lg font-bold text-text">No trade account yet</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
          Your sign-in is not linked to a trade account, so there are no orders
          to track.
        </p>
      </div>
    );
  }

  const [all, branches] = await Promise.all([
    // Branch is a column, so the database does that one. The rest are applied
    // below, where the derived payment status exists.
    accountOrders(params.branch),
    accountBranches(),
  ]);

  // One clock for the whole render. Two calls to new Date() a millisecond
  // apart can put an invoice on one side of its due date in the filter and the
  // other side in the pill beside it.
  const now = new Date();
  const orders = filterOrders(all, params, now);

  const open = orders.filter((order) => isOpenOrder(order.status));
  const filtered = hasActiveFilters(params);

  const totals = orders.reduce(
    (sum, order) => ({
      net: sum.net + order.subtotalFils,
      vat: sum.vat + order.vatFils,
      total: sum.total + order.totalFils,
    }),
    { net: 0, vat: 0, total: 0 }
  );

  return (
    <>
      <div>
        <h2 className="text-lg font-bold tracking-tight text-text">
          Your orders
        </h2>
        <p className="mt-1 text-sm text-text-muted tnum">
          {all.length === 0
            ? "Nothing ordered yet"
            : filtered
              ? `${orders.length} of ${all.length} orders match`
              : `${open.length} in progress · ${orders.length - open.length} completed`}
        </p>
      </div>

      {all.length > 0 && (
        <UrlFilters
          basePath="/account/orders"
          // The one screen that applies on pick. See the note on the prop.
          autoApply
          searchName="q"
          searchValue={params.q ?? ""}
          searchPlaceholder="Reference or your PO number"
          selects={[
            {
              name: "status",
              label: "Status",
              // "All statuses" rather than a bare "All": the closed dropdown is
              // the only place this filter's name is written.
              allLabel: "All statuses",
              value: params.status ?? "",
              options: statusOptions(),
            },
            {
              name: "payment",
              label: "Payment",
              allLabel: "All payments",
              value: params.payment ?? "",
              options: paymentOptions(),
            },
            // Only when there is a choice to make: one branch is not a filter.
            ...(branches.length > 1
              ? [
                  {
                    name: "branch",
                    label: "Branch",
                    allLabel: "All branches",
                    value: params.branch ?? "",
                    options: branches.map((b) => ({
                      value: b.id,
                      label: b.label ?? b.city,
                    })),
                  },
                ]
              : []),
            {
              name: "period",
              label: "Placed",
              // Not "All placed", which is not English. This filter is a date
              // range, and the word for all of it is any time.
              allLabel: "Any time",
              value: params.period ?? "",
              options: PERIODS,
            },
          ]}
        />
      )}

      {all.length === 0 ? (
        <div className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
          <p className="text-sm text-text-muted">
            When you place an order it appears here, with where it has got to.
          </p>
          <Link
            href="/products"
            className="mt-5 inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
          >
            Browse the catalogue
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center shadow-card">
          <p className="text-sm text-text-muted">
            No orders match these filters.
          </p>
          {/* The way out is on the screen: a filter you cannot clear is a page
              that looks broken. */}
          <Link
            href="/account/orders"
            className="mt-4 inline-block text-sm font-bold text-navy hover:underline"
          >
            Clear the filters
          </Link>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
                In progress{" "}
                <span className="tnum text-text-muted">({open.length})</span>
              </h3>
              <ul className="mt-2 space-y-3">
                {open.map((order) => (
                  <OpenOrderCard key={order.id} order={order} now={now} />
                ))}
              </ul>
            </section>
          )}

          {/* --- the ledger, moved here from Spending --- */}
          <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
            <div>
              <h3 className="text-base font-bold tracking-tight text-text">
                Your invoices
              </h3>
              <p className="mt-1 max-w-xl text-sm text-text-muted">
                {filtered
                  ? "Every order matching the filters above."
                  : "Every order you have placed."}{" "}
                Open one to read it, print it, or save it as a PDF.
              </p>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th className="py-1.5 pr-3 font-bold">Reference</th>
                    <th className="py-1.5 pr-3 font-bold">Date</th>
                    <th className="py-1.5 pr-3 font-bold">Branch</th>
                    <th className="py-1.5 pr-3 font-bold">Status</th>
                    <th className="py-1.5 pr-3 font-bold">Payment</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Net</th>
                    <th className="py-1.5 pr-3 text-right font-bold">VAT</th>
                    <th className="py-1.5 pr-3 text-right font-bold">Total</th>
                    <th className="py-1.5 font-bold">Get it</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border-base last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`/orders/${order.reference}`}
                          className="font-bold tnum text-navy hover:underline"
                        >
                          {order.reference}
                        </Link>
                        {order.poReference && (
                          <span className="block text-xs text-text-subtle tnum">
                            your PO {order.poReference}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 tnum text-text-muted">
                        {day(order.placedAt)}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">
                        {order.address?.label ?? order.address?.city ?? "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill
                          status={deliveryStatusOf(order)}
                          axis="delivery"
                          size="small"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <StatusPill
                          status={paymentStatusOf(order, now)}
                          axis="payment"
                          size="small"
                        />
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-text">
                        {aed(order.subtotalFils)}
                      </td>
                      <td className="py-2 pr-3 text-right tnum text-text-muted">
                        {aed(order.vatFils)}
                      </td>
                      <td className="py-2 pr-3 text-right font-bold tnum text-text">
                        {aed(order.totalFils)}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/account/invoices/${order.reference}`}
                          className="text-xs font-bold text-navy hover:underline"
                        >
                          Invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* Totalling what is ON SCREEN, not what exists. A sum that
                    ignores the filter above it is a number somebody will
                    quote at their accountant. */}
                <tfoot>
                  <tr className="border-t-2 border-border-strong text-sm">
                    <td className="py-2 pr-3 font-bold text-text" colSpan={5}>
                      {filtered ? "Total of these orders" : "Total of all orders"}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text">
                      {aed(totals.net)}
                    </td>
                    <td className="py-2 pr-3 text-right tnum text-text-muted">
                      {aed(totals.vat)}
                    </td>
                    <td className="py-2 pr-3 text-right font-bold tnum text-text">
                      {aed(totals.total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              Net is ex-VAT with VAT shown separately. The filters are in the
              address bar, so a link to exactly what you are looking at can be
              sent to whoever needs it.
            </p>
          </section>
        </>
      )}
    </>
  );
}

type OrderRow = Awaited<ReturnType<typeof accountOrders>>[number];

function OpenOrderCard({ order, now }: { order: OrderRow; now: Date }) {
  const split = splitDeliveryNote(order.items.map((item) => item.status));

  return (
    <li className="rounded-card border border-border-base bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/orders/${order.reference}`}
            className="font-bold tnum text-navy hover:underline"
          >
            {order.reference}
          </Link>
          <p className="mt-0.5 text-sm text-text-muted tnum">
            <Meta order={order} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-bold tnum text-text">{aed(order.totalFils)}</span>
          {/* Money and goods travel separately on credit terms, and a customer
              who cannot see an invoice has gone overdue only finds out when we
              ring them. */}
          <StatusPill
            status={paymentStatusOf(order, now)}
            axis="payment"
            size="small"
          />
        </div>
      </div>

      <div className="mt-4">
        <OrderProgress status={order.status} />
      </div>

      {/* Only when it is true: on an order where every line agrees with the
          headline this says nothing, and a note that says nothing is noise. */}
      {split && (
        <p className="mt-2 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
          {split}
        </p>
      )}

      {(order.courier || order.trackingNumber || order.estimatedShipmentOn) && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border-base pt-3 text-sm">
          {order.estimatedShipmentOn && (
            <Fact label="Expected to leave us">
              {day(order.estimatedShipmentOn)}
            </Fact>
          )}
          {order.courier && <Fact label="Courier">{order.courier}</Fact>}
          {order.trackingNumber && (
            <Fact label="Tracking">{order.trackingNumber}</Fact>
          )}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/orders/${order.reference}`}
          className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:bg-surface-hover"
        >
          View order
        </Link>
        <Link
          href={`/account/reorder/${order.reference}`}
          className="rounded-card bg-brand px-3 py-1.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
        >
          Order again
        </Link>
        <InvoiceActions reference={order.reference} />
      </div>
    </li>
  );
}

function Meta({ order }: { order: OrderRow }) {
  const who = order.staff?.name ?? order.placedByName;
  return (
    <>
      {day(order.placedAt)} &middot; {order.items.length}{" "}
      {order.items.length === 1 ? "line" : "lines"}
      {order.address?.label ? ` · ${order.address.label}` : ""}
      {who ? ` · ordered by ${who}` : ""}
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd className="tnum text-text">{children}</dd>
    </div>
  );
}
