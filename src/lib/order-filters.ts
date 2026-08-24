import { paymentStatusOf, statusMeaning, type PaymentFacts } from "./status-tone.ts";

/**
 * Narrowing a customer's own order list.
 *
 * The account had one filter — branch — and the client asked for the set their
 * operations tool offers: status, payment, a period and a search box (DEC-20
 * is the standing decision to take the back office's shape from it).
 *
 * PURE, AND IT TAKES THE CLOCK. Payment is not a stored word you can compare
 * against: "Overdue" and "Due soon" are the stored status with the passage of
 * time folded in, and paymentStatusOf is what folds it. A filter that matched
 * on the column would quietly disagree with the pill sitting next to it in the
 * same row — the customer would filter to Overdue and get nothing, while three
 * rows on screen said Overdue.
 *
 * Filtering happens in memory rather than in the query, and deliberately: the
 * derived payment status does not exist in the database to be queried, and the
 * list is capped at 100 orders, so the choice is between one honest pass over
 * a hundred rows and a second source of truth for what "overdue" means.
 */

export type OrderFilterParams = {
  /** Free text against the reference or the customer's own PO number. */
  q?: string;
  /** A fulfilment status — Pending, Processing, Dispatched, Delivered, Cancelled. */
  status?: string;
  /** A DERIVED payment status — Unpaid, DueSoon, PartiallyPaid, Paid, Overdue, Refunded. */
  payment?: string;
  /** How far back to look: 30, 90, 365, or anything else for everything. */
  period?: string;
  /** A branch id. Applied in the query rather than here, since it is a column. */
  branch?: string;
};

export type FilterableOrder = PaymentFacts & {
  reference: string;
  poReference?: string | null;
  status: string;
  placedAt: Date;
};

/** The periods offered, in days. Anything else means no date limit. */
export const PERIODS: { value: string; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

/**
 * The statuses a CUSTOMER can meaningfully pick.
 *
 * Not every fulfilment status in the system: the customer-facing track is four
 * stages plus cancelled, and offering "Backordered" as a filter on a screen
 * that never uses the word would be offering a choice that explains nothing.
 */
export const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Dispatched",
  "Delivered",
  "Cancelled",
] as const;

/** The payment states worth filtering by, in the order a person thinks of them. */
export const PAYMENT_STATUSES = [
  "Unpaid",
  "DueSoon",
  "PartiallyPaid",
  "Overdue",
  "Paid",
  "Refunded",
] as const;

/** Options for a select, labelled the way the pills are labelled. */
export function statusOptions(): { value: string; label: string }[] {
  return ORDER_STATUSES.map((status) => ({
    value: status,
    label: statusMeaning("fulfilment", status).label,
  }));
}

export function paymentOptions(): { value: string; label: string }[] {
  return PAYMENT_STATUSES.map((status) => ({
    value: status,
    label: statusMeaning("payment", status).label,
  }));
}

/** The cutoff a period implies, or null for no limit. */
export function periodStart(period: string | undefined, now: Date): Date | null {
  const days = Number(period);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Does this order survive the filters?
 *
 * Every unset filter passes everything, so an empty set returns the list
 * unchanged rather than nothing — the failure mode where a page loads empty
 * because a filter defaulted to something.
 */
export function matchesFilters(
  order: FilterableOrder,
  params: OrderFilterParams,
  now: Date
): boolean {
  const term = params.q?.trim().toLowerCase();
  if (term) {
    // Reference or their own PO number: those are the two things a person has
    // written down somewhere and is holding while they look at this screen.
    const haystack = [order.reference, order.poReference ?? ""]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(term)) return false;
  }

  if (params.status && order.status !== params.status) return false;

  if (params.payment) {
    if (paymentStatusOf(order, now) !== params.payment) return false;
  }

  const from = periodStart(params.period, now);
  if (from && order.placedAt < from) return false;

  return true;
}

export function filterOrders<T extends FilterableOrder>(
  orders: T[],
  params: OrderFilterParams,
  now: Date
): T[] {
  return orders.filter((order) => matchesFilters(order, params, now));
}

/** Whether anything is actually narrowing the list, for a "clear" control. */
export function hasActiveFilters(params: OrderFilterParams): boolean {
  return Boolean(
    params.q?.trim() ||
      params.status ||
      params.payment ||
      params.branch ||
      (params.period && params.period !== "all")
  );
}
