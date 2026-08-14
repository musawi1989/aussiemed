import type { TaxClass } from "./types";

/**
 * Pricing arithmetic in fils — the integer minor unit the database stores.
 *
 * money.ts does the same job in AED for display. This module exists because
 * anything that gets written to an order must never round-trip through a
 * float: converting fils to AED, multiplying, and converting back is exactly
 * how a stored invoice ends up a cent out.
 *
 * Everything here is pure, so it is testable without a database.
 */

/** Standard UAE VAT, in basis points. 500 = 5%. */
export const DEFAULT_VAT_BASIS_POINTS = 500;

export type TierFils = { minQty: number; priceFils: number };

export type PricedLine = {
  qty: number;
  unitPriceFils: number;
  lineTotalFils: number;
  vatFils: number;
};

/**
 * The unit price for a quantity: the best break the quantity qualifies for,
 * falling back to the SKU price. Tiers may arrive in any order.
 */
export function unitPriceFilsFor(
  basePriceFils: number,
  tiers: TierFils[],
  qty: number
): number {
  const q = Math.max(1, Math.trunc(qty));
  let price = basePriceFils;
  for (const tier of [...tiers].sort((a, b) => a.minQty - b.minQty)) {
    if (q >= tier.minQty) price = tier.priceFils;
  }
  return price;
}

/** Basis points for a line, honouring zero-rating. */
export function vatBasisPointsFor(
  taxClass: TaxClass | string,
  standardBasisPoints = DEFAULT_VAT_BASIS_POINTS
): number {
  return taxClass === "ZeroRated" || taxClass === "zero-rated"
    ? 0
    : standardBasisPoints;
}

/**
 * Prices one line. VAT is rounded per line, because a line's VAT is what
 * appears on the invoice — summing unrounded VAT and rounding once would make
 * the printed lines disagree with the printed total.
 */
export function priceLine(
  basePriceFils: number,
  tiers: TierFils[],
  qty: number,
  taxClass: TaxClass | string,
  standardBasisPoints = DEFAULT_VAT_BASIS_POINTS
): PricedLine {
  const q = Math.max(1, Math.trunc(qty));
  const unitPriceFils = unitPriceFilsFor(basePriceFils, tiers, q);
  const lineTotalFils = unitPriceFils * q;
  const bp = vatBasisPointsFor(taxClass, standardBasisPoints);
  // Integer arithmetic throughout; half-up on the final division only.
  const vatFils = Math.round((lineTotalFils * bp) / 10000);
  return { qty: q, unitPriceFils, lineTotalFils, vatFils };
}

export type InvoiceTotals = {
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
};

/** Sums already-priced lines. Both inputs are integers, so this is exact. */
export function sumLines(lines: PricedLine[]): InvoiceTotals {
  const subtotalFils = lines.reduce((n, l) => n + l.lineTotalFils, 0);
  const vatFils = lines.reduce((n, l) => n + l.vatFils, 0);
  return { subtotalFils, vatFils, totalFils: subtotalFils + vatFils };
}

/**
 * Reference number: AM-YYYY-NNNNNN.
 *
 * INVENTED FORMAT — see AC-06. The sequence is allocated server-side inside
 * the checkout transaction, never in the browser, so two simultaneous orders
 * cannot receive the same number.
 */
export function formatReference(year: number, sequence: number): string {
  return `AM-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Invoice number: the order reference with a per-supplier suffix.
 *
 * INVENTED FORMAT — see AC-07. Derived from the reference so an invoice can
 * always be traced back to its order by eye.
 */
export function formatInvoiceNumber(reference: string, index: number): string {
  return `${reference}-${String(index).padStart(2, "0")}`;
}

/** Fils to AED, for display at the very edge of the system. */
export const filsToAed = (fils: number) => Math.round(fils) / 100;
