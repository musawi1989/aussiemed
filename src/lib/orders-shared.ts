import type { Product } from "./types";

/**
 * Order types and formatting shared by server and client components.
 *
 * Deliberately free of any data access. demo-account.ts reaches the database,
 * so a client component importing from it would drag Prisma into the browser
 * bundle — which is exactly the build error that produced this file.
 */

export const DEMO_CUSTOMER = {
  name: "Layla Haddad",
  company: "Al Barsha Family Clinic",
  email: "procurement@albarshaclinic.example",
  emirate: "Dubai",
};

export type ResolvedLine = {
  product: Product;
  qty: number;
  unitPriceAED: number;
  lineTotalAED: number;
};

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
  status: "Delivered" | "Dispatched" | "Processing";
  poReference: string | null;
  invoices: SupplierInvoice[];
  lines: ResolvedLine[];
  subtotalAED: number;
  vatAED: number;
  totalAED: number;
  itemCount: number;
};

export type ReorderEntry = {
  product: Product;
  lastQty: number;
  lastOrderedOn: string;
  timesOrdered: number;
};

/** "28 July 2026" — explicit month name, no ambiguous numeric ordering. */
export function formatOrderDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${day} ${months[month - 1]} ${year}`;
}
