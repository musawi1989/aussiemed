import type { ProductPerformance } from "./own-brand";

/**
 * The whole-business profit figure, and the rows behind it.
 *
 * Pure, so the totals can be tested without a database — the arithmetic per
 * product already lives in own-brand.ts and margin.ts, and this only adds up
 * what they produced and sorts it.
 *
 * ⚠ THE TOTAL IS OF THE COSTED PART ONLY, and says so. A line we sold but have
 * no purchase cost for contributes revenue and no profit, so adding its
 * revenue into the total would inflate the margin towards 100% — exactly the
 * "a missing cost is unknown, not zero" rule that shapes margin.ts, applied one
 * level up. costedRevenueFils, not revenueFils, is the denominator.
 */

export type ProfitTotals = {
  /** Everything sold, ex-VAT, whether or not we know what it cost. */
  revenueFils: number;
  /** The part of that revenue whose cost is known — what the margin is of. */
  costedRevenueFils: number;
  /** What we paid our suppliers for the costed part. */
  costFils: number;
  /** costedRevenue − cost. The number the client asked for. */
  profitFils: number;
  /** Profit as a percentage of costed revenue, to one decimal. */
  marginPercent: number | null;
  unitsSold: number;
  /** Units we cannot judge, reported rather than assumed away. */
  uncostedUnits: number;
  /** Revenue we cannot judge — the gap between the two revenue figures. */
  uncostedRevenueFils: number;
  productsSold: number;
  productsCosted: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function profitTotals(rows: ProductPerformance[]): ProfitTotals {
  let revenueFils = 0;
  let costedRevenueFils = 0;
  let costFils = 0;
  let unitsSold = 0;
  let uncostedUnits = 0;
  let productsCosted = 0;

  for (const row of rows) {
    revenueFils += row.revenueFils;
    unitsSold += row.units;
    uncostedUnits += row.uncostedUnits;

    // Only rows with a known cost join the profit sum. profitFils is null
    // exactly when nothing on that product has been costed.
    if (row.profitFils !== null && row.costFils !== null) {
      costedRevenueFils += row.costedRevenueFils;
      costFils += row.costFils;
      productsCosted += 1;
    }
  }

  const profitFils = costedRevenueFils - costFils;

  return {
    revenueFils,
    costedRevenueFils,
    costFils,
    profitFils,
    // Guarded: with nothing costed there is no margin, and 0% would read as
    // "we made nothing" rather than "we cannot say".
    marginPercent:
      costedRevenueFils > 0 ? round1((profitFils / costedRevenueFils) * 100) : null,
    unitsSold,
    uncostedUnits,
    uncostedRevenueFils: revenueFils - costedRevenueFils,
    productsSold: rows.length,
    productsCosted,
  };
}

/**
 * The table order: most profitable first, then everything we cannot judge.
 *
 * Gross profit rather than margin, deliberately. A 60% margin on one box a
 * year is worth less than 8% on a pallet a week, and a table sorted by
 * percentage puts the trivial line at the top — the same reasoning the "earns
 * the most" table already follows.
 *
 * Uncosted products sink to the bottom rather than being dropped: they are
 * real sales, and the ones somebody needs to go and cost.
 */
export function byProfit(rows: ProductPerformance[]): ProductPerformance[] {
  return [...rows].sort((a, b) => {
    const left = a.profitFils;
    const right = b.profitFils;
    if (left === null && right === null) return b.revenueFils - a.revenueFils;
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  });
}

/**
 * Products sold at or below what we paid for them.
 *
 * Worth its own answer because it is the one thing on this screen that is
 * always a mistake rather than merely a low number — a price list loaded
 * against the wrong cost, or a cost that rose without the price following.
 */
export function losingMoney(rows: ProductPerformance[]): ProductPerformance[] {
  return rows
    .filter((row) => row.profitFils !== null && row.profitFils <= 0)
    .sort((a, b) => (a.profitFils ?? 0) - (b.profitFils ?? 0));
}
