import { db } from "@/lib/db";
import { formatAED } from "@/lib/money";
import { FilterBar, type ChipDef } from "@/components/admin/FilterBar";
import { ColumnPicker } from "@/components/admin/ColumnPicker";
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

  const columns = parseColumns(one("cols"));
  const { key: sortKey, dir: sortDir } = parseSort(one("sort"));
  const pageSize = parsePageSize(one("size"));
  const page = Math.max(1, Number(one("page")) || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { reference: { contains: q } },
            { poReference: { contains: q } },
            { trackingNumber: { contains: q } },
            { user: { email: { contains: q } } },
            { user: { name: { contains: q } } },
            { organisation: { name: { contains: q } } },
            // Searching an item code is how the warehouse finds the order a
            // particular line belongs to.
            { items: { some: { skuCodeSnapshot: { contains: q } } } },
          ],
        }
      : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(payments.length ? { paymentStatus: { in: payments } } : {}),
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
      options: PAYMENT_STATUSES.map((s) => ({
        value: s,
        label: s === "PartiallyPaid" ? "Partially paid" : s,
      })),
    },
    { kind: "dateRange", keyFrom: "createdFrom", keyTo: "createdTo", label: "Date created" },
    { kind: "dateRange", keyFrom: "shipFrom", keyTo: "shipTo", label: "Ship by" },
    { kind: "amountRange", keyMin: "min", keyMax: "max", label: "Total" },
  ];

  return (
    <>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Orders</h1>
          <p className="mt-1 text-sm text-text-muted tnum">
            {total.toLocaleString("en-AE")}{" "}
            {total === 1 ? "order" : "orders"} matching
          </p>
        </div>

        <div className="flex items-center gap-2">
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
