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

/**
 * What one account pays, beyond the list price everyone sees.
 *
 * Both are optional and they are NOT alternatives — an account can have a
 * discount and an agreed price on some of what it buys. They just never apply
 * to the same line. See accountUnitPriceFils.
 */
export type AccountTerms = {
  /** Off list, in basis points. 250 = 2.5%. Zero means no discount. */
  discountBasisPoints?: number;
  /** A price agreed for this SKU, in fils. Undefined when there is none. */
  agreedPriceFils?: number | null;
};

/**
 * A percentage off, in exact integer arithmetic.
 *
 * Rounded HALF UP on the final division and never through a float. 2.5% of
 * 1799 fils is 44.975, and a float would make it 44.974999999999994 — which
 * rounds the same way today and will not on some other figure. The whole
 * reason money is fils is to keep this exact.
 *
 * A discount can never take a price below zero, and never below what it
 * started at: a negative basis-point value would otherwise be a price rise
 * wearing a discount's name.
 */
export function applyDiscountFils(priceFils: number, basisPoints: number): number {
  if (!Number.isFinite(basisPoints) || basisPoints <= 0) return priceFils;
  // 10000bp is everything. More than that would be paying them to take it.
  const bp = Math.min(Math.trunc(basisPoints), 10000);
  const off = Math.round((priceFils * bp) / 10000);
  return Math.max(0, priceFils - off);
}

/**
 * The unit price for one account, one SKU, one quantity.
 *
 * THE ORDER OF PRECEDENCE, which is the whole of this feature:
 *
 *   1. An AGREED PRICE wins outright. It is a number both sides shook hands
 *      on. Volume breaks do not improve it and the account discount does NOT
 *      stack on top — a buyer who negotiated a price and then found another
 *      2.5% coming off it would be right to ask which figure we meant, and a
 *      supplier reading the same row would get a different answer than us.
 *   2. Otherwise the best VOLUME BREAK the quantity qualifies for, exactly as
 *      before.
 *   3. Then the ACCOUNT DISCOUNT off that. Applied after the break rather
 *      than before because a break is a better list price, and a discount is
 *      off what you would otherwise pay — doing it the other way rounds twice
 *      and lands a fils out on some quantities.
 *
 * With no terms at all this is exactly unitPriceFilsFor, which is what every
 * existing caller keeps getting.
 */
export function accountUnitPriceFils(
  basePriceFils: number,
  tiers: TierFils[],
  qty: number,
  terms: AccountTerms = {}
): number {
  const agreed = terms.agreedPriceFils;
  // Zero is a real agreed price — a free item on a tender. Only null and
  // undefined mean "no agreement", which is why this is not a truthiness test.
  if (agreed !== null && agreed !== undefined) return Math.max(0, Math.trunc(agreed));

  const listed = unitPriceFilsFor(basePriceFils, tiers, qty);
  return applyDiscountFils(listed, terms.discountBasisPoints ?? 0);
}

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
  standardBasisPoints = DEFAULT_VAT_BASIS_POINTS,
  // Last and optional, so every existing call is unchanged and still prices
  // at list — which is what a guest and a browsing visitor must get.
  terms: AccountTerms = {}
): PricedLine {
  const q = Math.max(1, Math.trunc(qty));
  const unitPriceFils = accountUnitPriceFils(basePriceFils, tiers, q, terms);
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

export type PriceComparison = {
  /** What this account actually pays, in fils. */
  yoursFils: number;
  /** What it would cost without their agreement, at this quantity. */
  listFils: number;
  /** Positive only when they are genuinely better off. */
  savingFils: number;
  /** For a percentage, in basis points. 1250 = 12.5%. */
  savingBasisPoints: number;
  /** Whether there is anything worth showing a struck-through price for. */
  betterThanList: boolean;
};

/**
 * Their price against the one everybody else sees, for display.
 *
 * The comparison is against the price they WOULD pay at this quantity with no
 * agreement — so at twelve it is measured against the volume break, not
 * against the single-unit price. Measuring against the base price would show a
 * bigger number and it would be a lie: the break is available to anybody.
 *
 * betterThanList CAN BE FALSE, and that is not a bug to paper over. An agreed
 * price wins outright over volume breaks (see accountUnitPriceFils), so an
 * account that negotiated a rate a year ago can be paying above a break that
 * has since been added. Showing a struck-through price there would invent a
 * saving that does not exist; the caller shows the price plainly instead, and
 * somebody here gets to notice the arrangement has gone stale.
 */
export function comparePriceFils(
  basePriceFils: number,
  tiers: TierFils[],
  qty: number,
  terms: AccountTerms = {}
): PriceComparison {
  const listFils = unitPriceFilsFor(basePriceFils, tiers, qty);
  const yoursFils = accountUnitPriceFils(basePriceFils, tiers, qty, terms);

  const savingFils = Math.max(0, listFils - yoursFils);

  return {
    yoursFils,
    listFils,
    savingFils,
    // Guarded against a zero list price, which would otherwise divide by zero
    // and render NaN% on a free line.
    savingBasisPoints:
      listFils > 0 ? Math.round((savingFils / listFils) * 10_000) : 0,
    betterThanList: savingFils > 0,
  };
}
