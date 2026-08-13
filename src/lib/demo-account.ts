import { getProductById, getSupplierName } from "./catalog";
import { lineTotal, round2, unitPriceFor, VAT_RATE } from "./money";
import type { Product } from "./types";

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

export const DEMO_CUSTOMER = {
  name: "Layla Haddad",
  company: "Al Barsha Family Clinic",
  email: "procurement@albarshaclinic.example",
  emirate: "Dubai",
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

export type ResolvedLine = {
  product: Product;
  qty: number;
  unitPriceAED: number;
  lineTotalAED: number;
};

/** One invoice per supplier — the structure the backend must reproduce. */
export type SupplierInvoice = {
  supplierId: number;
  supplierName: string;
  invoiceNumber: string;
  lines: ResolvedLine[];
  subtotalAED: number;
  vatAED: number;
  totalAED: number;
};

export type ResolvedOrder = {
  reference: string;
  placedOn: string;
  status: DemoOrder["status"];
  poReference: string | null;
  invoices: SupplierInvoice[];
  lines: ResolvedLine[];
  subtotalAED: number;
  vatAED: number;
  totalAED: number;
  itemCount: number;
};

function resolveLine(line: DemoOrderLine): ResolvedLine | null {
  const product = getProductById(line.productId);
  if (!product) return null;
  return {
    product,
    qty: line.qty,
    unitPriceAED: unitPriceFor(product.priceAED, product.tiers, line.qty),
    lineTotalAED: lineTotal(product.priceAED, product.tiers, line.qty),
  };
}

export function resolveOrder(order: DemoOrder): ResolvedOrder {
  const lines = order.lines
    .map(resolveLine)
    .filter((l): l is ResolvedLine => l !== null);

  // Group by supplier — exactly one invoice per distinct supplier, which is
  // the constraint that fixes the old platform's duplicate-invoice bug.
  const bySupplier = new Map<number, ResolvedLine[]>();
  for (const line of lines) {
    const list = bySupplier.get(line.product.supplierId) ?? [];
    list.push(line);
    bySupplier.set(line.product.supplierId, list);
  }

  const invoices: SupplierInvoice[] = [...bySupplier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([supplierId, supplierLines], index) => {
      const subtotal = round2(
        supplierLines.reduce((sum, l) => sum + l.lineTotalAED, 0)
      );
      const vat = round2(subtotal * VAT_RATE);
      return {
        supplierId,
        supplierName: getSupplierName(supplierId),
        invoiceNumber: `${order.reference}-${String(index + 1).padStart(2, "0")}`,
        lines: supplierLines,
        subtotalAED: subtotal,
        vatAED: vat,
        totalAED: round2(subtotal + vat),
      };
    });

  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotalAED, 0));
  const vat = round2(subtotal * VAT_RATE);

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

export function getDemoOrders(): ResolvedOrder[] {
  return DEMO_ORDERS.map(resolveOrder);
}

export function getDemoOrder(reference: string): ResolvedOrder | undefined {
  const match = DEMO_ORDERS.find((o) => o.reference === reference);
  return match ? resolveOrder(match) : undefined;
}

export type ReorderEntry = {
  product: Product;
  lastQty: number;
  lastOrderedOn: string;
  timesOrdered: number;
};

/**
 * The reorder-first list: everything previously bought, most recently ordered
 * first, with the quantity last used so one tap repeats the last order line.
 */
export function getReorderList(): ReorderEntry[] {
  const seen = new Map<number, ReorderEntry>();

  for (const order of DEMO_ORDERS) {
    for (const line of order.lines) {
      const product = getProductById(line.productId);
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

/** "28 July 2026" — explicit month name, no ambiguous numeric ordering. */
export function formatOrderDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}
