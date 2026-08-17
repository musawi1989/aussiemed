import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { ORDER_LINE_STATUSES, PAYMENT_STATUSES } from "@/lib/admin";
import { ORDER_STATUSES } from "@/lib/order-views";
import { StatusPill } from "@/components/StatusPill";
import { deliveryStatusOf, paymentStatusOf } from "@/lib/status-tone";
import { OrderLineCard } from "@/components/admin/OrderLineCard";
import { OrderSidebar } from "@/components/admin/OrderSidebar";
import { OrderMarginPanel } from "@/components/admin/OrderMarginPanel";
import { EmailInvoiceForm } from "@/components/admin/EmailInvoiceForm";
import { invoiceRecipient } from "@/lib/invoice-email";
import { orderMargin } from "@/lib/margin-data";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Anything expiring inside three months is worth flagging before it ships. */
const EXPIRY_WARNING_DAYS = 90;

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  const order = await db.order.findUnique({
    where: { reference },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      organisation: {
        select: {
          id: true,
          name: true,
          trn: true,
          paymentTerms: true,
          creditLimitFils: true,
          notes: true,
          emirate: true,
        },
      },
      items: {
        orderBy: { nameSnapshot: "asc" },
        include: {
          sku: { select: { product: { select: { id: true, name: true } } } },
          // Where each line's units actually came from, once received. This
          // is the internal view of the supply chain, and the only place a
          // supplier is named on an order at all.
          allocations: {
            select: {
              qty: true,
              batchCode: true,
              purchaseOrderLine: {
                select: {
                  purchaseOrder: {
                    select: {
                      poNumber: true,
                      supplier: { select: { companyName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!order) notFound();

  // Fetched on its own, admin-guarded. Cost is never carried by a query that
  // something customer-facing might come to reuse.
  const margin = await orderMargin(order.reference);
  // Who the invoice would go to, and whether it can call itself compliant.
  const invoice = await invoiceRecipient(order.reference);

  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const shipping = parseShippingAddress(order.shippingSnapshot);

  const allItems = order.items;
  const zeroRatedFils = allItems
    .filter((i) => i.taxClassSnapshot === "ZeroRated")
    .reduce((n, i) => n + i.lineTotalFils, 0);
  const backordered = allItems.filter((i) => i.status === "Backordered");
  const withoutLot = allItems.filter((i) => !i.batchCodeSnapshot);
  const expired = allItems.filter(
    (i) => i.expiresOnSnapshot && i.expiresOnSnapshot < now
  );

  const overdue =
    order.paymentStatus !== "Paid" &&
    order.paymentDueOn !== null &&
    order.paymentDueOn < now;

  /** Only the things that actually need a person, so an empty bar means nothing to do. */
  const alerts = [
    expired.length > 0 && {
      tone: "danger" as const,
      text: `${expired.length} line${expired.length === 1 ? " carries" : "s carry"} stock that is already past its expiry date.`,
    },
    !order.organisation?.trn && {
      tone: "danger" as const,
      text: "No TRN on this account, so the tax invoice for this order is not a compliant UAE document — AC-03.",
    },
    overdue && {
      tone: "danger" as const,
      text: `Payment was due ${day(order.paymentDueOn)} and the order is still ${order.paymentStatus.toLowerCase()}.`,
    },
    backordered.length > 0 && {
      tone: "accent" as const,
      text: `${backordered.length} line${backordered.length === 1 ? " is" : "s are"} on backorder.`,
    },
    withoutLot.length > 0 && {
      tone: "accent" as const,
      text: `${withoutLot.length} of ${allItems.length} lines have no batch recorded. A recall could not be traced to this order.`,
    },
    order.organisation?.notes && {
      tone: "info" as const,
      text: `Account note: ${order.organisation.notes}`,
    },
  ].filter(Boolean) as { tone: "danger" | "accent" | "info"; text: string }[];

  const closed = order.status === "Delivered" || order.status === "Cancelled";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/admin/orders"
            className="text-sm font-semibold text-text-muted hover:text-navy"
          >
            &larr; All orders
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight tnum text-text">
            {order.reference}
            <StatusPill axis="fulfilment" status={order.status} />
            <StatusPill axis="delivery" status={deliveryStatusOf(order)} />
            {/* Worked out rather than read: the column still says "Unpaid" on
                an invoice that fell due a month ago, and nothing rewrites it at
                midnight. */}
            <StatusPill axis="payment" status={paymentStatusOf(order, new Date())} />
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DocLink href={`/admin/orders/${reference}/picking-list`} label="Picking list" />
          <DocLink href={`/admin/orders/${reference}/delivery-note`} label="Delivery note" />
          <DocLink href={`/admin/orders/${reference}/tax-invoice`} label="Tax invoice" />
        </div>
      </div>

      {/* Emailing it is next to the document it sends, not on another screen. */}
      <div className="mt-4">
        <EmailInvoiceForm
          reference={order.reference}
          defaultTo={invoice?.to ?? null}
          alreadySentTo={invoice?.alreadySentTo ?? null}
          compliant={invoice?.compliant ?? false}
        />
      </div>

      {alerts.length > 0 && (
        <ul className="mt-4 space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.text}
              className={`rounded-card border-l-4 px-4 py-2.5 text-sm font-semibold ${
                alert.tone === "danger"
                  ? "border-danger bg-danger-soft text-danger"
                  : alert.tone === "accent"
                    ? "border-accent-border bg-accent-soft text-text"
                    : "border-navy-border bg-navy-soft text-text"
              }`}
            >
              {alert.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 className="text-base font-bold tracking-tight text-text">
                Order details
              </h2>
              <dl className="text-right text-xs tnum text-text-subtle">
                <div>Placed {order.placedAt.toISOString().slice(0, 16).replace("T", " ")}</div>
                <div>Updated {order.updatedAt.toISOString().slice(0, 16).replace("T", " ")}</div>
                {order.paidAt && (
                  <div>Paid {order.paidAt.toISOString().slice(0, 16).replace("T", " ")}</div>
                )}
              </dl>
            </div>

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Money label="Subtotal" value={aed(order.subtotalFils)} />
              <Money label="Zero rated" value={aed(zeroRatedFils)} />
              <Money
                label={`VAT at ${order.vatRateBasisPoints / 100}%`}
                value={aed(order.vatFils)}
              />
              <Money label="Delivery" value={aed(order.deliveryPriceFils)} />
              <Money label="Total" value={aed(order.totalFils)} strong />
              <Money
                label="Received"
                value={aed(order.paidFils)}
                strong={order.paidFils > 0}
              />
              <Money
                label="Outstanding"
                value={aed(Math.max(0, order.totalFils - order.paidFils))}
                strong={order.totalFils - order.paidFils > 0}
              />
            </dl>

            <p className="mt-3 text-xs leading-relaxed text-text-subtle">
              The VAT rate is the one in force when the order was placed, so a
              later rate change cannot rewrite this document. Payment method:{" "}
              {order.paymentMethod}
              {order.poReference ? ` · PO ${order.poReference}` : ""}.
            </p>

            {order.customerNotes && (
              <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-sm text-text">
                <span className="font-bold">Customer note:</span>{" "}
                {order.customerNotes}
              </p>
            )}
          </section>

          {/* One list of lines.
           *
           * This was a card per supplier invoice. The order is no longer split
           * that way — AussieMed sells, and buying happens afterwards through
           * the daily purchase orders. Where a line's units came from is shown
           * per line below, from its allocations, which is more precise than
           * the old grouping: it knows the purchase order and the lot, not
           * just the company. */}
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
              <h2 className="text-base font-bold tracking-tight text-text">
                {order.items.length} line{order.items.length === 1 ? "" : "s"}
              </h2>

              <ul className="mt-3 space-y-2">
                {order.items.map((item) => (
                  <OrderLineCard
                    key={item.id}
                    reference={order.reference}
                    statuses={ORDER_LINE_STATUSES}
                    item={{
                      id: item.id,
                      name: item.nameSnapshot,
                      skuCode: item.skuCodeSnapshot,
                      unitLabel: item.unitLabelSnapshot,
                      taxClass: item.taxClassSnapshot,
                      qty: item.qty,
                      unitPrice: aed(item.unitPriceFils),
                      lineTotal: aed(item.lineTotalFils),
                      vat: aed(item.vatFils),
                      status: item.status,
                      batchCode: item.batchCodeSnapshot,
                      expiresOn: day(item.expiresOnSnapshot),
                      // Named from what was actually bought for this line, not
                      // from the product record. Empty until goods are in.
                      supplier:
                        item.allocations
                          .map(
                            (a) =>
                              a.purchaseOrderLine.purchaseOrder.supplier.companyName
                          )
                          .filter((name, i, all) => all.indexOf(name) === i)
                          .join(", ") || "not yet purchased",
                      productHref: item.sku?.product
                        ? `/admin/products/${item.sku.product.id}`
                        : null,
                      expired: Boolean(
                        item.expiresOnSnapshot && item.expiresOnSnapshot < now
                      ),
                      expiringSoon: Boolean(
                        item.expiresOnSnapshot &&
                          item.expiresOnSnapshot >= now &&
                          item.expiresOnSnapshot <= soon
                      ),
                    }}
                  />
                ))}
              </ul>
          </section>

          <OrderMarginPanel margin={margin} />
        </div>

        <div className="space-y-5">
          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-bold tracking-tight text-text">
                Customer
              </h2>
              <Link
                href={`/admin/customers?q=${encodeURIComponent(order.user?.email ?? "")}`}
                className="text-xs font-semibold text-navy hover:underline"
              >
                Account &rarr;
              </Link>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Name" value={order.user?.name ?? "Guest"} />
              <Row label="Email" value={order.user?.email ?? "—"} />
              <Row label="Phone" value={order.user?.phone ?? "—"} />
              <Row label="Organisation" value={order.organisation?.name ?? "—"} />
              <Row label="Emirate" value={order.organisation?.emirate ?? "—"} />
              <Row
                label="TRN"
                value={order.organisation?.trn ?? "not captured"}
                warn={!order.organisation?.trn}
              />
              <Row label="Terms" value={order.organisation?.paymentTerms ?? "—"} />
              <Row
                label="Credit limit"
                value={
                  order.organisation?.creditLimitFils
                    ? aed(order.organisation.creditLimitFils)
                    : "—"
                }
              />
            </dl>
            {shipping && (
              <div className="mt-3 rounded-card bg-surface-sunken px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-text-subtle">
                  Delivering to
                </p>
                <address className="mt-1 text-xs not-italic leading-relaxed text-text-muted">
                  {addressLines(shipping).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              </div>
            )}
          </section>

          <OrderSidebar
            reference={order.reference}
            status={order.status}
            statuses={ORDER_STATUSES}
            paymentStatuses={PAYMENT_STATUSES}
            closed={closed}
            payment={{
              paymentStatus: order.paymentStatus,
              paidAED: (order.paidFils / 100).toFixed(2),
              totalAED: aed(order.totalFils),
              paymentDueOn: day(order.paymentDueOn),
              overdue,
            }}
            delivery={{
              deliveryType: order.deliveryType,
              courier: order.courier ?? "",
              trackingNumber: order.trackingNumber ?? "",
              estimatedShipmentOn: day(order.estimatedShipmentOn),
            }}
            internalNotes={order.internalNotes ?? ""}
          />

          <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
            <h2 className="text-base font-bold tracking-tight text-text">
              History
            </h2>
            <Link
              href={`/admin/audit?entity=Order&id=${order.id}`}
              className="mt-2 inline-block text-xs font-semibold text-navy hover:underline"
            >
              Every change to this order &rarr;
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}

function DocLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-card border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text-muted transition-colors hover:text-navy"
    >
      {label}
    </Link>
  );
}

function Money({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-subtle">{label}</dt>
      <dd className={`tnum ${strong ? "font-bold text-text" : "text-text-muted"}`}>
        {value}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={`text-right tnum ${warn ? "font-bold text-danger" : "text-text"}`}>
        {value}
      </dd>
    </div>
  );
}
