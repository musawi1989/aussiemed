/**
 * Which lines are worth making our own — FE-45.
 *
 * Three questions the client asked, in one place: what earns the most, what
 * moves the most, and what would be worth putting our own label on. The first
 * two are arithmetic. The third is a judgement, so this module makes the
 * judgement explicit — the score is built from named parts and every candidate
 * carries the reasons it scored, rather than arriving as a number nobody can
 * argue with.
 *
 * No database access. The rules can then be tested against invented orders
 * rather than against whatever nineteen test orders happen to contain, and the
 * same arithmetic serves the screen, a future export and anything that later
 * wants to email a buyer about it.
 *
 * TWO RULES INHERITED FROM margin.ts, because a report that quietly disagreed
 * with the order screen would be worse than no report:
 *   - a missing cost is unknown, never zero;
 *   - a line whose units are only part-delivered has no realised margin yet.
 * Anything uncosted is counted and reported separately, never folded in at
 * zero and never silently dropped.
 */

/** One sold line, already reduced to what this module needs. */
export type SoldLine = {
  productSlug: string;
  productName: string;
  brand: string | null;
  /** Deepest category the product sits in, for grouping. */
  category: string | null;
  qty: number;
  /** Ex-VAT, in fils. */
  revenueFils: number;
  /** Realised cost of the whole line, or null when it cannot be known yet. */
  costFils: number | null;
  orderReference: string;
  /** Which account bought it — breadth matters more than volume alone. */
  organisationId: string;
  /** How many suppliers can supply this line. A commodity has more than one. */
  supplierCount: number;
};

export type ProductPerformance = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  units: number;
  orders: number;
  /** Distinct accounts that have bought it. */
  customers: number;
  revenueFils: number;
  /** Revenue of the lines whose cost is known — the only part that can be judged. */
  costedRevenueFils: number;
  costFils: number | null;
  /** Null when nothing has been costed yet. */
  profitFils: number | null;
  /** Margin on the costed part, to one decimal. Null when unknown. */
  marginPercent: number | null;
  /** Units sold whose cost is not known. Reported, never assumed. */
  uncostedUnits: number;
  supplierCount: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function performanceByProduct(lines: SoldLine[]): ProductPerformance[] {
  const byProduct = new Map<
    string,
    ProductPerformance & { orderSet: Set<string>; customerSet: Set<string> }
  >();

  for (const line of lines) {
    const qty = Math.max(0, Math.round(line.qty));
    const existing = byProduct.get(line.productSlug) ?? {
      slug: line.productSlug,
      name: line.productName,
      brand: line.brand,
      category: line.category,
      units: 0,
      orders: 0,
      customers: 0,
      revenueFils: 0,
      costedRevenueFils: 0,
      costFils: null,
      profitFils: null,
      marginPercent: null,
      uncostedUnits: 0,
      supplierCount: line.supplierCount,
      orderSet: new Set<string>(),
      customerSet: new Set<string>(),
    };

    existing.units += qty;
    existing.revenueFils += Math.round(line.revenueFils);
    existing.orderSet.add(line.orderReference);
    existing.customerSet.add(line.organisationId);
    existing.supplierCount = Math.max(existing.supplierCount, line.supplierCount);

    if (line.costFils === null) {
      existing.uncostedUnits += qty;
    } else {
      existing.costedRevenueFils += Math.round(line.revenueFils);
      existing.costFils = (existing.costFils ?? 0) + Math.round(line.costFils);
    }

    byProduct.set(line.productSlug, existing);
  }

  return [...byProduct.values()]
    .map((row) => {
      const { orderSet, customerSet, ...rest } = row;
      const profitFils =
        rest.costFils === null ? null : rest.costedRevenueFils - rest.costFils;

      return {
        ...rest,
        orders: orderSet.size,
        customers: customerSet.size,
        profitFils,
        marginPercent:
          profitFils === null || rest.costedRevenueFils <= 0
            ? null
            : round1((profitFils / rest.costedRevenueFils) * 100),
      };
    })
    .sort((a, b) => b.revenueFils - a.revenueFils || a.name.localeCompare(b.name));
}

/**
 * What earns the most, which is profit and not margin.
 *
 * A 60% margin on one box a year is worth less than 12% on four hundred, and
 * ranking by percentage is how a catalogue ends up optimised for the things
 * nobody buys. Lines with no known cost cannot be ranked here at all, so they
 * are excluded rather than sorted as if they earned nothing.
 */
export function mostProfitable(
  performance: ProductPerformance[],
  limit = 10
): ProductPerformance[] {
  return performance
    .filter((row) => row.profitFils !== null)
    .sort((a, b) => (b.profitFils ?? 0) - (a.profitFils ?? 0))
    .slice(0, limit);
}

/** What moves the most, by units rather than by money. */
export function mostPurchased(
  performance: ProductPerformance[],
  limit = 10
): ProductPerformance[] {
  return [...performance]
    .sort((a, b) => b.units - a.units || b.orders - a.orders)
    .slice(0, limit);
}

export type CandidateReason = string;

export type OwnBrandCandidate = ProductPerformance & {
  /** 0 to 100. Comparable within one report, meaningless between two. */
  score: number;
  reasons: CandidateReason[];
};

/**
 * Below this, a ranking is noise dressed as insight — the same threshold the
 * lifecycle reports use before they will quote a median.
 */
export const MIN_ORDERS_TO_RANK = 5;

/**
 * What is worth putting our own label on.
 *
 * Four things matter, and they pull in different directions, which is why this
 * is a weighted score and not a sort:
 *
 *   VOLUME (35%)      Own-brand economics are about a minimum order quantity.
 *                     A line we ship by the pallet pays for a print run; one we
 *                     ship twice a year does not.
 *   BREADTH (25%)     How many different accounts buy it. A line one clinic
 *                     loves is that clinic's preference, not a product line.
 *   MARGIN GAP (25%)  THE COUNTER-INTUITIVE ONE. The best candidates are the
 *                     lines we make LEAST on, because the brand is taking that
 *                     margin today and owning the line is how we take it back.
 *                     Ranking by current profit would point at exactly the
 *                     lines already working.
 *   REPEAT (15%)      Orders rather than units: predictable demand is what
 *                     makes stock-holding on an own brand survivable.
 *
 * A line nobody can cost is excluded, because three of the four parts cannot be
 * computed and a guess here commits real money to a print run.
 *
 * Scores are normalised against the best line in the same report, so they say
 * "compared with everything else you sell" and nothing at all when compared
 * with last month's report.
 */
export function ownBrandCandidates(
  performance: ProductPerformance[],
  limit = 10
): OwnBrandCandidate[] {
  const judgeable = performance.filter(
    (row) => row.profitFils !== null && row.marginPercent !== null && row.units > 0
  );
  if (judgeable.length === 0) return [];

  const max = {
    units: Math.max(...judgeable.map((r) => r.units)),
    customers: Math.max(...judgeable.map((r) => r.customers)),
    orders: Math.max(...judgeable.map((r) => r.orders)),
  };

  const share = (value: number, ceiling: number) => (ceiling > 0 ? value / ceiling : 0);

  return judgeable
    .map((row) => {
      // A margin of 60% leaves little to win back; 10% leaves a great deal.
      // Clamped, because a loss-making line is not five times the opportunity
      // of a thin one — it is a pricing problem first.
      const marginGap = Math.min(1, Math.max(0, 1 - (row.marginPercent ?? 0) / 100));

      const score =
        share(row.units, max.units) * 35 +
        share(row.customers, max.customers) * 25 +
        marginGap * 25 +
        share(row.orders, max.orders) * 15;

      const reasons: CandidateReason[] = [];
      // A line sold under cost scores well here, and should: we are stocking
      // somebody else brand at a loss. But it is a PRICING problem before it
      // is a branding one, and saying so stops a print run being ordered to
      // fix something a price list would fix this afternoon.
      if ((row.marginPercent ?? 0) < 0) {
        reasons.push(`selling below cost at ${row.marginPercent}% — price it first`);
      }
      if (row.units >= max.units * 0.5) reasons.push(`${row.units} units sold`);
      if (row.customers >= 3) reasons.push(`bought by ${row.customers} accounts`);
      if ((row.marginPercent ?? 100) < 25) {
        reasons.push(`only ${row.marginPercent}% margin today`);
      }
      if (row.orders >= 3) reasons.push(`reordered across ${row.orders} orders`);
      if (row.supplierCount > 1) {
        reasons.push(`${row.supplierCount} suppliers already make it`);
      }
      if (row.brand) reasons.push(`currently ${row.brand}`);

      return { ...row, score: Math.round(score), reasons };
    })
    .sort((a, b) => b.score - a.score || b.units - a.units)
    .slice(0, limit);
}

/**
 * Where the money goes by category, so a private-label programme can start with
 * a shelf rather than a single line — own brands are usually launched as a
 * range, and the range is what a category tells you.
 */
export type CategorySpend = {
  category: string;
  units: number;
  revenueFils: number;
  profitFils: number | null;
  marginPercent: number | null;
  products: number;
};

export function spendByCategory(performance: ProductPerformance[]): CategorySpend[] {
  const byCategory = new Map<string, CategorySpend & { costed: number }>();

  for (const row of performance) {
    const key = row.category ?? "Uncategorised";
    const existing = byCategory.get(key) ?? {
      category: key,
      units: 0,
      revenueFils: 0,
      profitFils: null,
      marginPercent: null,
      products: 0,
      costed: 0,
    };

    existing.units += row.units;
    existing.revenueFils += row.revenueFils;
    existing.products += 1;
    if (row.profitFils !== null) {
      existing.profitFils = (existing.profitFils ?? 0) + row.profitFils;
      existing.costed += row.costedRevenueFils;
    }

    byCategory.set(key, existing);
  }

  return [...byCategory.values()]
    .map(({ costed, ...row }) => ({
      ...row,
      marginPercent:
        row.profitFils === null || costed <= 0
          ? null
          : round1((row.profitFils / costed) * 100),
    }))
    .sort((a, b) => b.revenueFils - a.revenueFils);
}

/**
 * What the report cannot see, stated rather than hidden.
 *
 * A merchandising decision made on half the data is worse than one postponed,
 * so the screen says how much of its own basis is missing.
 */
export type ReportCoverage = {
  productsSold: number;
  productsCosted: number;
  unitsSold: number;
  uncostedUnits: number;
  orders: number;
  enoughToRank: boolean;
};

export function coverageOf(
  performance: ProductPerformance[],
  orderCount: number
): ReportCoverage {
  return {
    productsSold: performance.length,
    productsCosted: performance.filter((r) => r.profitFils !== null).length,
    unitsSold: performance.reduce((n, r) => n + r.units, 0),
    uncostedUnits: performance.reduce((n, r) => n + r.uncostedUnits, 0),
    orders: orderCount,
    enoughToRank: orderCount >= MIN_ORDERS_TO_RANK,
  };
}
