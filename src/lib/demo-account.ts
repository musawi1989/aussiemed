import { getProductById, getSupplierName } from "./catalog";
import { lineTotal, round2, unitPriceFor, vatRateFor } from "./money";
import {
  DEMO_CUSTOMER,
  formatOrderDate,
  type ReorderEntry,
  type ResolvedLine,
  type ResolvedOrder,
  type SupplierInvoice,
} from "./orders-shared";

// Re-exported so existing server imports keep working.
export {
  DEMO_CUSTOMER,
  formatOrderDate,
  type ReorderEntry,
  type ResolvedLine,
  type ResolvedOrder,
  type SupplierInvoice,
};

/**
 * A stand-in order history so the reorder-first landing, order list and
 * per-supplier invoice split can be built and reviewed before auth and the
 * database exist.
 *
 * Everything here is fabricated. Dates are fixed literals rather than computed
 * from the clock so the pages render identically on every build.
 */

export type DemoOrderLine = {
  productId: number;
  qty: number;
};

export type DemoOrder = {
  reference: string;
  placedOn: string; // ISO date
  status: "Delivered" | "Dispatched" | "Processing";
  poReference: string | null;
  lines: DemoOrderLine[];
};


/** Newest first. */
export const DEMO_ORDERS: DemoOrder[] = [
  {
    reference: "AM-2026-000318",
    placedOn: "2026-07-28",
    status: "Delivered",
    // Bare number — the "PO" label is added by the UI.
    poReference: "4471",
    lines: [
      { productId: 1000, qty: 24 }, // Nitrile gloves medium — supplier 21
      { productId: 1007, qty: 12 }, // Alcohol hand rub — supplier 22
      { productId: 1012, qty: 30 }, // Sterile gauze swabs — supplier 23
      { productId: 1019, qty: 4 }, // Digital thermometer — supplier 24
    ],
  },
  {
    reference: "AM-2026-000274",
    placedOn: "2026-06-15",
    status: "Delivered",
    poReference: "4402",
    lines: [
      { productId: 1003, qty: 20 }, // Surgical face masks — supplier 21
      { productId: 1009, qty: 6 }, // Disinfectant wipes — supplier 22
      { productId: 172, qty: 20 }, // TENA pads — supplier 21
      { productId: 1035, qty: 12 }, // Couch roll — supplier 21
    ],
  },
  {
    reference: "AM-2026-000201",
    placedOn: "2026-05-02",
    status: "Delivered",
    poReference: null,
    lines: [
      { productId: 171, qty: 3 }, // Omron BP monitor — supplier 21
      { productId: 1022, qty: 5 }, // Stethoscope — supplier 24
      { productId: 1015, qty: 24 }, // Micropore tape — supplier 23
    ],
  },
];




async function resolveLine(line: DemoOrderLine): Promise<ResolvedLine | null> {
  const product = await getProductById(line.productId);
  if (!product) return null;
  return {
    product,
    qty: line.qty,
    unitPriceAED: unitPriceFor(product.priceAED, product.tiers, line.qty),
    lineTotalAED: lineTotal(product.priceAED, product.tiers, line.qty),
  };
}

export async function resolveOrder(order: DemoOrder): Promise<ResolvedOrder> {
  const lines = (await Promise.all(order.lines.map(resolveLine))).filter(
    (l): l is ResolvedLine => l !== null
  );

  // Group by supplier — exactly one invoice per distinct supplier, which is
  // the constraint that fixes the old platform's duplicate-invoice bug.
  const bySupplier = new Map<number, ResolvedLine[]>();
  for (const line of lines) {
    const list = bySupplier.get(line.product.supplierId) ?? [];
    list.push(line);
    bySupplier.set(line.product.supplierId, list);
  }

  const invoices: SupplierInvoice[] = await Promise.all(
    [...bySupplier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(async ([supplierId, supplierLines], index) => {
      const subtotal = round2(
        supplierLines.reduce((sum, l) => sum + l.lineTotalAED, 0)
      );
      // VAT per line, since some medical lines are zero-rated.
      const vat = round2(
        supplierLines.reduce(
          (sum, l) => sum + l.lineTotalAED * vatRateFor(l.product.taxClass),
          0
        )
      );
      return {
        supplierId,
        supplierName: await getSupplierName(supplierId),
        invoiceNumber: `${order.reference}-${String(index + 1).padStart(2, "0")}`,
        lines: supplierLines,
        subtotalAED: subtotal,
        vatAED: vat,
        totalAED: round2(subtotal + vat),
      };
    })
  );

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotalAED, 0));
  const vat = round2(
    lines.reduce((sum, l) => sum + l.lineTotalAED * vatRateFor(l.product.taxClass), 0)
  );

  return {
    reference: order.reference,
    placedOn: order.placedOn,
    status: order.status,
    poReference: order.poReference,
    invoices,
    lines,
    subtotalAED: subtotal,
    vatAED: vat,
    totalAED: round2(subtotal + vat),
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
  };
}

export async function getDemoOrders(): Promise<ResolvedOrder[]> {
  return Promise.all(DEMO_ORDERS.map(resolveOrder));
}

export async function getDemoOrder(
  reference: string
): Promise<ResolvedOrder | undefined> {
  const match = DEMO_ORDERS.find((o) => o.reference === reference);
  return match ? resolveOrder(match) : undefined;
}


/**
 * The reorder-first list: everything previously bought, most recently ordered
 * first, with the quantity last used so one tap repeats the last order line.
 */
export async function getReorderList(): Promise<ReorderEntry[]> {
  const seen = new Map<number, ReorderEntry>();

  for (const order of DEMO_ORDERS) {
    for (const line of order.lines) {
      const product = await getProductById(line.productId);
      if (!product) continue;

      const existing = seen.get(line.productId);
      if (existing) {
        existing.timesOrdered += 1;
        // DEMO_ORDERS is newest first, so the first sighting is the latest.
        continue;
      }
      seen.set(line.productId, {
        product,
        lastQty: line.qty,
        lastOrderedOn: order.placedOn,
        timesOrdered: 1,
      });
    }
  }

  return [...seen.values()];
}

