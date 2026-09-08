import Link from "next/link";
import { EntityLogo } from "@/components/EntityLogo";
import { clientKey, clientWhere, clientName } from "@/lib/client-grouping";
import { db } from "@/lib/db";
import { paymentCriteriaWhere, paymentStatusOf, SETTLEMENT_STATES, PAYMENT_DUE_STATES } from "@/lib/status-tone";
import { contains } from "@/lib/db-search";
import { formatAED } from "@/lib/money";
import { FilterBar, type ChipDef } from "@/components/admin/FilterBar";
import { ColumnPicker } from "@/components/admin/ColumnPicker";
import { PushAllOrdersButton } from "@/components/admin/PushToSuppliers";
import { ViewTabs } from "@/components/admin/ViewTabs";
import { OrdersTable, type OrderRow } from "@/components/admin/OrdersTable";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  parseAmountRange,
  parseColumns,
  parseDateRange,
  parseMulti,
  parsePageSize,
  parseSort,
} from "@/lib/order-views";

const aed = (fils: number) => formatAED(fils / 100);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * The orders list.
 *
 * Everything that decides what is on screen — filters, columns, sort, page —
 * lives in the URL, and the page is rendered on the server from it. That makes
 * a configured view shareable, the back button meaningful, and the table
 * itself free of any data fetching.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const q = (one("q") ?? "").trim();
  const statuses = parseMulti(params.status, ORDER_STATUSES);
  const payments = parseMulti(params.payment, PAYMENT_STATUSES);
  /* No supplier filter. An order is not associated with a supplier any more —
     what was bought for it, and from whom, is decided later on a purchase
     order. Filtering orders by supplier would answer a question about buying
     using the wrong list; /admin/purchasing is where that lives. */
  const created = parseDateRange(one("createdFrom"), one("createdTo"));
  const placed = parseDateRange(one("placedFrom"), one("placedTo"));
  const ship = parseDateRange(one("shipFrom"), one("shipTo"));
  const amount = parseAmountRange(one("min"), one("max"));

  // One clock for the query and for the pills it renders, so a row cannot be
  // filtered in as overdue and then drawn as merely unpaid.
  const now = new Date();
  const paymentWhere = paymentCriteriaWhere(payments, parseMulti(params.due, PAYMENT_DUE_STATES), now);

  const columns = parseColumns(one("cols"));
  const { key: sortKey, dir: sortDir } = parseSort(one("sort"));
  const pageSize = parsePageSize(one("size"));
  const page = Math.max(1, Number(one("page")) || 1);

  /*
   * ?issue=stock — open orders carrying a line we hold none of.
   *
   * The storefront says nothing about stock, so a buyer can order what we have
   * not got. These are worth a phone call offering an alternative rather than
   * a silent wait, which is what the card on Needs attention links to.
   *
   * Live, not snapshotted: an order whose line has come back into stock is no
   * longer a call anybody needs to make and drops off this list by itself.
   */
  const stockIssue =
    one("issue") === "stock"
      ? {
          status: { notIn: ["Delivered", "Cancelled"] },
          items: { some: { sku: { manualOutOfStock: true } } },
        }
      : null;

  /*
   * Everything that has to go UNDER `AND` rather than be spread in.
   *
   * Collected into one array on purpose. Both of these carry keys the object
   * below already uses — payment brings its own `OR`, the stock filter brings
   * a `status` — and a second copy of a key replaces the first rather than
   * joining it. Spread separately, choosing a status and then following the
   * out-of-stock link would silently drop the status.
   */
  const andClauses = [stockIssue, paymentWhere].filter(Boolean) as object[];

  const selectedClient = one("client");
  const where = {
    ...(selectedClient ? clientWhere(selectedClient) : {}),
    ...(q
      ? {
          OR: [
            { reference: contains(q) },
            { shippingSnapshot: contains(q) },
            { placedByName: contains(q) },
            { poReference: contains(q) },
            { trackingNumber: contains(q) },
            { user: { email: contains(q) } },
            { user: { name: contains(q) } },
            { organisation: { name: contains(q) } },
            // Searching an item code is how the warehouse finds the order a
            // particular line belongs to.
            { items: { some: { skuCodeSnapshot: contains(q) } } },
          ],
        }
      : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),


    /*
     * Payment is DERIVED, not read off the column.
     *
     * "Overdue" and "Due soon" are never stored: they are the stored word plus
     * the passage of time, worked out by paymentStatusOf so a screen is right
     * when it is looked at rather than when a job last ran. This list filtered
     * on the column, so Overdue matched nothing at all while ten invoices sat
     * overdue in front of it, and Unpaid quietly included every one of them —
     * the wrong answer in the reassuring direction.
     *
     * UNDER `AND`, not spread in. The search above already puts an `OR` on
     * this object, and a second `OR` key would replace it rather than join it:
     * searching and filtering at the same time would silently drop the search.
     */
    ...(andClauses.length ? { AND: andClauses } : {}),
    ...(created.from || created.to
      ? { placedAt: { ...(created.from && { gte: created.from }), ...(created.to && { lte: created.to }) } }
      : {}),
    ...(placed.from || placed.to
      ? { updatedAt: { ...(placed.from && { gte: placed.from }), ...(placed.to && { lte: placed.to }) } }
      : {}),
    ...(ship.from || ship.to
      ? {
          estimatedShipmentOn: {
            ...(ship.from && { gte: ship.from }),
            ...(ship.to && { lte: ship.to }),
          },
        }
      : {}),
    ...(amount.minFils !== undefined || amount.maxFils !== undefined
      ? {
          totalFils: {
            ...(amount.minFils !== undefined && { gte: amount.minFils }),
            ...(amount.maxFils !== undefined && { lte: amount.maxFils }),
          },
        }
      : {}),
  };

  if (!selectedClient) {
    const matching = await db.order.findMany({ where, orderBy: { placedAt: "desc" }, select: { id: true, organisationId: true, userId: true, totalFils: true, placedAt: true, shippingSnapshot: true, placedByName: true, organisation: { select: { name: true } }, user: { select: { name: true } } } });
    const clients = [...Map.groupBy(matching, clientKey).entries()];
    return <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">Orders by client</h1><p className="text-sm text-text-muted">{clients.length} clients · {matching.length} orders</p></div><PushAllOrdersButton /></div>
      <form className="my-4 flex gap-2"><input name="q" defaultValue={q} aria-label="Search clients or orders" placeholder="Search client, order or item" className="rounded-card border border-border-strong px-3 py-2" /><button className="rounded-card bg-navy px-4 py-2 text-white">Search</button></form>
      <ul className="space-y-3">{clients.map(([key, orders]) => { const first = orders[0]; const name = clientName(first); const query = new URLSearchParams(); for (const [k,v] of Object.entries(params)) { if (v && k !== "page") query.set(k, Array.isArray(v) ? v[0] : v); } query.set("client", key); return <li key={key}><Link className="flex items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 hover:border-navy" href={`/admin/orders?${query}`}><span className="flex items-center font-bold"><EntityLogo kind={first.organisationId ? "organisation" : "user"} id={first.organisationId ?? first.userId} name={name} />{name}</span><span className="text-sm">{orders.length} order{orders.length === 1 ? "" : "s"} · {aed(orders.reduce((n,o) => n + o.totalFils,0))}</span></Link></li>; })}</ul>
      {!clients.length && <p>No clients match these filters.</p>}
    </div>;
  }

  const orderBy =
    sortKey === "id"
      ? { reference: sortDir }
      : sortKey === "total"
        ? { totalFils: sortDir }
        : sortKey === "status"
          ? { status: sortDir }
          : sortKey === "placed"
            ? { updatedAt: sortDir }
            : { placedAt: sortDir };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true, phone: true } },
        organisation: { select: { name: true, trn: true, paymentTerms: true } },
        items: {
          select: {
            status: true,
            taxClassSnapshot: true,
            lineTotalFils: true,
          },
        },
      },
    }),
  ]);

  const rows: OrderRow[] = orders.map((order) => {
    const zeroRated = order.items
      .filter((i) => i.taxClassSnapshot === "ZeroRated")
      .reduce((n, i) => n + i.lineTotalFils, 0);

    return {
      reference: order.reference,
      href: `/admin/orders/${order.reference}`,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentDueStatus: paymentStatusOf(order, now),
      customerNote: order.customerNotes,
      internalNote: order.internalNotes,
      backordered: order.items.filter((i) => i.status === "Backordered").length,
      missingTrn: !order.organisation?.trn,
      cells: {
        id: order.reference,
        created: day(order.placedAt),
        placed: day(order.updatedAt),
        customer: order.user?.name ?? "Guest",
        organisation: order.organisation?.name ?? "",
        email: order.user?.email ?? "",
        phone: order.user?.phone ?? "",
        total: aed(order.totalFils),
        paid: order.paidAt ? day(order.paidAt) : "",
        terms: order.organisation?.paymentTerms ?? "",
        trn: order.organisation?.trn ?? "",
        lines: String(order.items.length),
        zeroRated: zeroRated > 0 ? aed(zeroRated) : "",
        vat: aed(order.vatFils),
        deliveryType: order.deliveryType === "PickUp" ? "Pick up" : "Delivery",
        shipmentDate: day(order.estimatedShipmentOn),
        tracking: order.trackingNumber ?? "",
        poNumber: order.poReference ?? "",
      },
    };
  });

  const chips: ChipDef[] = [
    {
      kind: "multi",
      key: "status",
      label: "Status",
      options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
    },
    {
      kind: "multi",
      key: "payment",
      label: "Payment",
      options: SETTLEMENT_STATES.map((s) => ({
        value: s,
        label: s === "PartiallyPaid" ? "Partially paid" : s,
      })),
    },
    { kind: "multi", key: "due", label: "Due date", options: PAYMENT_DUE_STATES.map((s) => ({ value: s, label: s === "DueSoon" ? "Due soon" : s === "NotDue" ? "Not overdue" : s })) },
    { kind: "dateRange", keyFrom: "createdFrom", keyTo: "createdTo", label: "Date created" },
    { kind: "dateRange", keyFrom: "shipFrom", keyTo: "shipTo", label: "Ship by" },
    { kind: "amountRange", keyMin: "min", keyMax: "max", label: "Total" },
  ];

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text"><EntityLogo kind={orders[0]?.organisationId ? "organisation" : "user"} id={orders[0]?.organisationId ?? orders[0]?.userId} name={clientName(orders[0])} />{clientName(orders[0])} — orders</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {total.toLocaleString("en-AE")}{" "}
            {total === 1 ? "order" : "orders"} matching
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Placing the book with suppliers belongs where the orders are, not
              only on the buying screen: the question "has all of this gone to
              our suppliers yet" is asked while looking at this list. */}
          <PushAllOrdersButton />
          <ViewTabs active="list" />
          <ColumnPicker basePath="/admin/orders" selected={columns} />
        </div>
      </div>

      <FilterBar
        basePath="/admin/orders"
        chips={chips}
        searchPlaceholder="Order, PO, tracking, customer or item code"
      />

      <OrdersTable
        rows={rows}
        columns={columns}
        total={total}
        page={page}
        pageSize={pageSize}
        pageCount={Math.max(1, Math.ceil(total / pageSize))}
        statuses={ORDER_STATUSES}
      />
    </>
  );
}
