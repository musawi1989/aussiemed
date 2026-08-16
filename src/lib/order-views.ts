/**
 * What the orders list can show, filter and sort by.
 *
 * No database access, so the list page, the board, the export and the column
 * picker all read the same definitions rather than three drifting copies.
 *
 * The column set is deliberately a distributor's, not a factory's. A 3D
 * printing queue cares about materials and lead times; a medical supplies
 * distributor cares about who is on credit terms, whether a TRN was captured,
 * how many suppliers an order has to be split across, and how much of it is
 * zero-rated — because that is what decides whether the paperwork is right.
 */

export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Dispatched",
  "Delivered",
  "Cancelled",
] as const;

/**
 * Fulfilment on a single line. Half an order ships today while one line waits
 * on a supplier — an order-level status cannot say that, and pretending it can
 * is how a customer gets told their whole order is delayed.
 */
export const ORDER_LINE_STATUSES = [
  "Pending",
  "Allocated",
  "Picked",
  "Packed",
  "Shipped",
  "Backordered",
  "Cancelled",
] as const;

/**
 * Payment, which on credit terms is not a yes or no. A part payment against a
 * Net 30 account is a real state, and so is an invoice that has gone past its
 * due date without being settled.
 */
export const PAYMENT_STATUSES = [
  "Unpaid",
  "PartiallyPaid",
  "Paid",
  "Overdue",
  "Refunded",
] as const;

export type ColumnKey =
  | "id"
  | "created"
  | "placed"
  | "customer"
  | "organisation"
  | "email"
  | "phone"
  | "total"
  | "status"
  | "paid"
  | "terms"
  | "trn"
  | "lines"
  | "zeroRated"
  | "vat"
  | "deliveryType"
  | "shipmentDate"
  | "tracking"
  | "poNumber"
  | "customerNotes"
  | "internalNotes";

export type ColumnDef = {
  key: ColumnKey;
  label: string;
  /** Right-align money and counts so columns of figures line up. */
  numeric?: boolean;
  /**
   * Atomic values that must never break across two lines. A reference split as
   * "AM-2026-" / "000004" or a total as "AED" / "217.51" stops being readable
   * at a glance, which is the only thing a table of this density is for. Free
   * text — names, addresses, notes — is left to wrap.
   */
  nowrap?: boolean;
  /** Only these can be sorted in the database without loading everything. */
  sortable?: boolean;
  hint?: string;
};

export const COLUMNS: ColumnDef[] = [
  { key: "id", label: "Order", sortable: true, nowrap: true },
  { key: "created", label: "Created", sortable: true, nowrap: true },
  { key: "placed", label: "Placed", sortable: true, nowrap: true },
  { key: "customer", label: "Customer" },
  { key: "organisation", label: "Organisation", hint: "The account being invoiced" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone", nowrap: true },
  { key: "total", label: "Total", numeric: true, sortable: true, nowrap: true },
  { key: "status", label: "Status", sortable: true, nowrap: true },
  { key: "paid", label: "Paid", nowrap: true },
  { key: "terms", label: "Terms", hint: "Prepaid, Net 7, Net 30, Net 60", nowrap: true },
  { key: "trn", label: "TRN", hint: "Missing means the tax invoice is not compliant", nowrap: true },
  { key: "lines", label: "Lines", numeric: true, nowrap: true },
  { key: "zeroRated", label: "Zero rated", numeric: true, nowrap: true, hint: "Portion of the order carrying no VAT" },
  { key: "vat", label: "VAT", numeric: true, nowrap: true },
  { key: "deliveryType", label: "Delivery", nowrap: true },
  { key: "shipmentDate", label: "Ship by", nowrap: true },
  { key: "tracking", label: "Tracking", nowrap: true },
  { key: "poNumber", label: "PO number", nowrap: true },
  { key: "customerNotes", label: "Customer notes" },
  { key: "internalNotes", label: "Internal notes" },
];

/** What a new admin sees before touching the column picker. */
export const DEFAULT_COLUMNS: ColumnKey[] = [
  "id",
  "created",
  "placed",
  "customer",
  "organisation",
  "total",
  "status",
  "paid",
  "lines",
  "customerNotes",
];

const COLUMN_KEYS = new Set(COLUMNS.map((c) => c.key));

/** `?cols=id,total,status` — in the URL so a configured view can be shared. */
export function parseColumns(raw: string | undefined): ColumnKey[] {
  if (!raw) return DEFAULT_COLUMNS;
  const picked = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ColumnKey => COLUMN_KEYS.has(s as ColumnKey));
  // An empty or entirely unrecognised list would render a table with no
  // columns, which looks like a bug rather than a choice.
  return picked.length > 0 ? picked : DEFAULT_COLUMNS;
}

export const SORTABLE = new Set(
  COLUMNS.filter((c) => c.sortable).map((c) => c.key)
);

export type SortKey = "id" | "created" | "placed" | "total" | "status";
export type SortDir = "asc" | "desc";

export function parseSort(raw: string | undefined): {
  key: SortKey;
  dir: SortDir;
} {
  const [key, dir] = (raw ?? "").split(":");
  const validKey = SORTABLE.has(key as ColumnKey) ? (key as SortKey) : "created";
  return { key: validKey, dir: dir === "asc" ? "asc" : "desc" };
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : 25;
}

/** A filter value may repeat: `?status=Pending&status=Processing`. */
export function parseMulti(
  value: string | string[] | undefined,
  allowed: readonly string[]
): string[] {
  const list = Array.isArray(value) ? value : value ? value.split(",") : [];
  return list.map((s) => s.trim()).filter((s) => allowed.includes(s));
}

/** Inclusive on both ends; either half may be omitted. */
export type DateRange = { from?: Date; to?: Date };

export function parseDateRange(
  from: string | undefined,
  to: string | undefined
): DateRange {
  const range: DateRange = {};
  if (from && !Number.isNaN(Date.parse(from))) range.from = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    // The "to" date is a day, not an instant: a filter reading 15 Aug should
    // include everything that happened on 15 Aug.
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    range.to = end;
  }
  return range;
}

export function parseAmountRange(
  min: string | undefined,
  max: string | undefined
): { minFils?: number; maxFils?: number } {
  const out: { minFils?: number; maxFils?: number } = {};
  const lo = Number(min);
  const hi = Number(max);
  if (min && Number.isFinite(lo)) out.minFils = Math.round(lo * 100);
  if (max && Number.isFinite(hi)) out.maxFils = Math.round(hi * 100);
  return out;
}

/** Every query key the list understands, so "clear all" can be exhaustive. */
export const FILTER_KEYS = [
  "q",
  "status",
  "payment",
  "createdFrom",
  "createdTo",
  "placedFrom",
  "placedTo",
  "shipFrom",
  "shipTo",
  "min",
  "max",
  "supplier",
  "page",
] as const;
