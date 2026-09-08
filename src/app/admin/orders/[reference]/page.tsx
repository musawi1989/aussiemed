import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PaymentLedger } from "@/components/admin/PaymentLedger";
import { mayReach } from "@/lib/admin-team";
import { formatAED } from "@/lib/money";
import {
  discountLabel,
  lineDiscount,
  orderDiscount,
  sourceLabel,
} from "@/lib/order-discounts";
import { ORDER_LINE_STATUSES, PAYMENT_STATUSES } from "@/lib/admin";
import { ORDER_STATUSES } from "@/lib/order-views";
import { StatusPill } from "@/components/StatusPill";
import { deliveryStatusOf, paymentStatusOf } from "@/lib/status-tone";
import { OrderLineCard } from "@/components/admin/OrderLineCard";
import { OrderSidebar } from "@/components/admin/OrderSidebar";
import { DeliveryReceipts } from "@/components/admin/DeliveryReceipts";
import { listDeliveryReceipts } from "@/lib/delivery-receipts";
import { courierOptions } from "@/lib/couriers";
import { Shipments } from "@/components/admin/Shipments";
import { shippingPlan } from "@/lib/shipments";
import { OrderMarginPanel } from "@/components/admin/OrderMarginPanel";
import { EmailInvoiceForm } from "@/components/admin/EmailInvoiceForm";
import { PushOrderButton } from "@/components/admin/PushToSuppliers";
import { invoiceRecipient } from "@/lib/invoice-email";
import { orderMargin } from "@/lib/margin-data";
import { addressLines, parseShippingAddress } from "@/lib/shipping-address";

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date | null) => (d ? new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 10) : "");

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
      payments: { orderBy: [{ occurredAt: "asc" }, { recordedAt: "asc" }] },
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
          // manualOutOfStock is read LIVE, not snapshotted. The question a
          // person has here is "can we fill this today", not "could we when
          // it was placed" — a line that has come back into stock is no
          // longer a problem and should stop being flagged as one.
          sku: {
            select: {
              manualOutOfStock: true,
              product: { select: { id: true, name: true } },
            },
          },
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
  const margin = await mayReach("/admin/reports") ? await orderMargin(order.reference) : null;

  // Carries whatever this order already names, so an archived courier on an
  // old order stays selectable rather than being blanked on the next save.
  const couriers = await courierOptions(order.courier);
  const receipts = await listDeliveryReceipts(order.id);
  // What has gone, in which batch, and what is still owed. Non-null: the order
  // was found above, and this reads the same row.
  const plan = await shippingPlan(order.reference);
  // Who the invoice would go to, and whether it can call itself compliant.
  const invoice = await invoiceRecipient(order.reference);

  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000);
  const shipping = parseShippingAddress(order.shippingSnapshot);

  const allItems = order.items;
  // The account's terms as they stood when the order was placed. Whoever is
  // answering a query about a price needs the arrangement, not just the figure.
  const saved = orderDiscount(allItems);
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

  /*
   * Lines we cannot fill right now.
   *
   * The storefront no longer says a word about stock, so a buyer can order
   * something we have none of — deliberately, because that order is a chance
   * to sell them an alternative rather than a sale lost to a competitor. This
   * is where that chance surfaces, and if nobody acts on it the buyer simply
   * waits, so it is the loudest thing on the page.
   */
  const unfillable = allItems.filter((i) => i.sku?.manualOutOfStock);

  /** Only the things that actually need a person, so an empty bar means nothing to do. */
  const alerts = [
    unfillable.length > 0 && {
      tone: "danger" as const,
      text: `${unfillable.length} line${unfillable.length === 1 ? " is" : "s are"} out of stock: ${unfillable.map((i) => i.nameSnapshot).join(", ")}. Call the customer and offer an alternative — they were not told.`,
    },
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
            className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white text-sm"
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
          {/* The order-wide note is the right document only while the order
              goes out in one piece. Once it has been split into batches, each
              batch has its own list under Packing lists & despatch below, and
              offering this one as well invites somebody to put a note listing
              the whole order into a box holding a third of it. */}
          {plan && plan.shipments.length === 0 && (
            <DocLink href={`/admin/orders/${reference}/delivery-note`} label="Packing list & delivery note" />
          )}
          <DocLink href={`/admin/orders/${reference}/tax-invoice`} label="Tax invoice" />
        </div>
      </div>

      {/* Emailing it is next to the document it sends, not on another screen.
          Placing the order with its suppliers sits beside it: both are things
          you do TO this order rather than documents you read off it. */}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <PushOrderButton reference={order.reference} />
        <EmailInvoiceForm
          reference={order.reference}
          defaultTo={invoice?.to ?? null}
          alreadySentTo={invoice?.alreadySentTo ?? null}
          compliant={invoice?.compliant ?? false}
          reasons={invoice?.reasons ?? []}
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
              {saved.discounted && saved.listSubtotalFils !== null && (
                <Money label="Subtotal at list" value={aed(saved.listSubtotalFils)} />
              )}
              {saved.sources.map((source) =>
                saved.savingBySource[source] > 0 ? (
                  <Money
                    key={source}
                    label={sourceLabel(
                      source,
                      source === "AccountDiscount"
                        ? order.accountDiscountBasisPoints
                        : undefined
                    )}
                    value={`−${aed(saved.savingBySource[source])}`}
                  />
                ) : null
              )}
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
                      listUnitPrice: (() => {
                        const off = lineDiscount(item);
                        return off.discounted && off.listUnitPriceFils !== null
                          ? aed(off.listUnitPriceFils)
                          : null;
                      })(),
                      discountNote: discountLabel(
                        lineDiscount(item),
                        order.accountDiscountBasisPoints
                      ),
                      lineTotal: aed(item.lineTotalFils),
                      vat: aed(item.vatFils),
                      status: item.status,
                      outOfStock: Boolean(item.sku?.manualOutOfStock),
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

          {/* Directly under the lines, because deciding what goes in the box is
              done by reading them — what is owed, what is on back order — and
              a despatch form on the other side of the page means scrolling
              between the question and the answer. */}
          {plan && (
            <Shipments
              reference={order.reference}
              lines={plan.lines}
              complete={plan.complete}
              nextSequence={plan.nextSequence}
              courierOptions={couriers}
              shipments={plan.shipments.map((shipment) => ({
                ...shipment,
                // Formatted here, like every other date on this page: the
                // client would render it in whatever timezone the person
                // happens to be sitting in.
                dispatchedOn: shipment.dispatchedAt ? day(shipment.dispatchedAt) : null,
                createdOn: day(shipment.createdAt),
              }))}
            />
          )}

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

          <PaymentLedger entity="Order" id={order.id} entries={order.payments} />
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
            courierOptions={couriers}
            internalNotes={order.internalNotes ?? ""}
          />

          {/* Under Delivery, because it is the last thing that happens to a
              delivery and the first thing anybody looks for when a customer
              says it never arrived. */}
          <DeliveryReceipts
            reference={order.reference}
            receipts={receipts.map((receipt) => ({
              id: receipt.id,
              fileName: receipt.fileName,
              receivedByName: receipt.receivedByName,
              // Formatted on the server, like every other date on this page:
              // the client would otherwise render it in whatever timezone the
              // person happens to be sitting in.
              receivedOn: receipt.receivedOn ? day(receipt.receivedOn) : null,
              note: receipt.note,
              uploadedAt: day(receipt.uploadedAt),
              uploadedByName: receipt.uploadedByName,
            }))}
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
