import "server-only";

import { db } from "./db";
import { requireSupplier } from "./supplier-portal";
import { paymentStatusOf } from "./status-tone";
import { monthKey, monthLabel, monthRange } from "./invoice-months.ts";

/**
 * A supplier's monthly invoice, compiled by us from what actually arrived.
 *
 * SELF-BILLING. The supplier does not send us an invoice and we do not key one
 * in: the site builds it from goods-in records, which means the figure can
 * never disagree with what we received. Both sides read the same document.
 *
 * A MONTH IS A CALENDAR MONTH, first to last, and a purchase order lands in
 * the month it was RECEIVED rather than ordered. What was ordered in one month
 * and arrived in the next is billed in the next, which is the month the goods
 * existed in our warehouse.
 *
 * ONLY WHAT ARRIVED IS BILLED. Lines are valued at qtyReceived, not
 * qtyOrdered, so a short delivery bills short without anybody adjusting
 * anything. A line that never arrived is worth nothing and does not appear.
 *
 * ⚠ A PARTIALLY RECEIVED ORDER IS NOT BILLED UNTIL IT COMPLETES. receivedAt is
 * stamped only when the last line lands, and there is no per-line receipt
 * date to bill from — so goods that arrived in January on an order finished in
 * February appear on February's invoice. That is consistent and reproducible
 * rather than correct, and it is the thing to revisit if part-deliveries
 * become common. Recorded as AC-19.
 *
 * PAYMENT IS DERIVED, NOT STORED AGAIN. Each purchase order already carries
 * its own payment state, which the admin sets and the supplier sees. A second
 * paid flag on the month would be a second answer to "have we paid this",
 * free to disagree with the first. A month is paid when every order in it is.
 */

export type InvoiceLine = {
  poNumber: string;
  receivedAt: Date | null;
  code: string;
  name: string;
  qtyReceived: number;
  unitCostFils: number | null;
  lineTotalFils: number | null;
};

export type SupplierInvoice = {
  /** "2026-08", and the id in the URL. */
  month: string;
  label: string;
  from: Date;
  to: Date;
  lines: InvoiceLine[];
  orderCount: number;
  /** Null when any line has no recorded cost — see the note on the model. */
  totalFils: number | null;
  /** How many lines we have no price for, said out loud rather than hidden. */
  uncostedLines: number;
  paymentStatus: string;
  paidFils: number;
};

async function compile(
  supplierId: string,
  month: string,
  now: Date
): Promise<SupplierInvoice | null> {
  const range = monthRange(month);
  if (!range) return null;

  const orders = await db.purchaseOrder.findMany({
    where: {
      supplierId,
      status: "Received",
      receivedAt: { gte: range.from, lt: range.to },
    },
    orderBy: { receivedAt: "asc" },
    select: {
      poNumber: true,
      receivedAt: true,
      paymentStatus: true,
      paymentDueOn: true,
      paidFils: true,
      lines: {
        orderBy: { nameSnapshot: "asc" },
        select: {
          supplierPartNumberSnapshot: true,
          skuCodeSnapshot: true,
          nameSnapshot: true,
          qtyReceived: true,
          unitCostFilsSnapshot: true,
        },
      },
    },
  });

  const lines: InvoiceLine[] = [];
  let total: number | null = 0;
  let uncosted = 0;

  for (const order of orders) {
    for (const line of order.lines) {
      // Nothing arrived, nothing to bill. A zero-quantity row on an invoice is
      // a row somebody has to work out the meaning of.
      if (line.qtyReceived <= 0) continue;

      const unit = line.unitCostFilsSnapshot;
      const lineTotal = unit === null ? null : unit * line.qtyReceived;
      if (lineTotal === null) uncosted += 1;
      // Null spreads rather than counting as zero: a total that quietly
      // treated an unpriced line as free would be wrong in the direction that
      // looks fine.
      total = lineTotal === null || total === null ? null : total + lineTotal;

      lines.push({
        poNumber: order.poNumber,
        receivedAt: order.receivedAt,
        code: line.supplierPartNumberSnapshot ?? line.skuCodeSnapshot,
        name: line.nameSnapshot,
        qtyReceived: line.qtyReceived,
        unitCostFils: unit,
        lineTotalFils: lineTotal,
      });
    }
  }

  /*
   * The month's payment state, from the orders in it.
   *
   * Worst-first: one overdue order makes the month overdue, and a month is
   * only Paid when every order in it is. Anything else would let a settled
   * majority hide an unpaid remainder, which is the direction nobody checks.
   */
  const statuses = orders.map((o) => paymentStatusOf(o, now));
  const paymentStatus =
    statuses.length === 0
      ? "Unpaid"
      : statuses.includes("Overdue")
        ? "Overdue"
        : statuses.every((s) => s === "Paid")
          ? "Paid"
          : statuses.some((s) => s === "Paid" || s === "PartiallyPaid")
            ? "PartiallyPaid"
            : statuses.includes("DueSoon")
              ? "DueSoon"
              : "Unpaid";

  return {
    month,
    label: monthLabel(month),
    from: range.from,
    to: range.to,
    lines,
    orderCount: orders.length,
    totalFils: total,
    uncostedLines: uncosted,
    paymentStatus,
    paidFils: orders.reduce((n, o) => n + o.paidFils, 0),
  };
}

/** One month for the signed-in supplier. Null when the month is not a month. */
export async function myInvoice(
  month: string,
  now = new Date()
): Promise<SupplierInvoice | null> {
  const { supplierId } = await requireSupplier();
  return compile(supplierId, month, now);
}

/**
 * Every month this supplier has anything in, newest first.
 *
 * Built from the months that actually have receipts rather than by walking
 * back a fixed number: a supplier of two years' standing and one who joined
 * last week both get exactly their own history, with no empty months in
 * between pretending an invoice exists.
 */
export async function myInvoiceMonths(
  now = new Date()
): Promise<SupplierInvoice[]> {
  const { supplierId } = await requireSupplier();

  const received = await db.purchaseOrder.findMany({
    where: { supplierId, status: "Received", receivedAt: { not: null } },
    select: { receivedAt: true },
  });

  const months = [
    ...new Set(received.map((o) => monthKey(o.receivedAt as Date))),
  ].sort((a, b) => b.localeCompare(a));

  const invoices = await Promise.all(
    months.map((month) => compile(supplierId, month, now))
  );
  return invoices.filter((i): i is SupplierInvoice => i !== null);
}
