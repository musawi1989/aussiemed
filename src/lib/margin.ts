/**
 * What AussieMed makes on something.
 *
 * No database access, so the product screen, the order screen and anything
 * later that reports on margin all compute it the same way. Everything is in
 * integer fils and nothing here rounds until it is asked for a percentage.
 *
 * **Admin only.** Nothing in this file may reach the storefront, the browser
 * catalogue snapshot or the supplier portal. A supplier who can see the markup
 * on their own goods is a commercial problem, not merely a privacy one — see
 * DEC-24 and the check:privacy guard.
 *
 * The one rule that shapes the whole module: a missing cost is *unknown*, not
 * zero. Treating it as zero shows a 100% margin on every product whose cost has
 * not been loaded yet, and a figure like that gets believed.
 */

export type Margin = {
  sellFils: number;
  /** Null when no cost has been recorded. Never defaulted to zero. */
  costFils: number | null;
  /** Null whenever the cost is unknown. */
  marginFils: number | null;
  /** Margin as a percentage of the sell price, to one decimal. Null if unknown. */
  marginPercent: number | null;
  /** Margin as a percentage of cost — the markup. Null if unknown or free. */
  markupPercent: number | null;
  /** True when we are selling at or below what we pay. */
  losing: boolean;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Margin on one unit, or on a whole line — the arithmetic is the same, so
 * callers pass whichever totals they have.
 */
export function marginOf(sellFils: number, costFils: number | null): Margin {
  const sell = Number.isFinite(sellFils) ? Math.round(sellFils) : 0;

  if (costFils === null || costFils === undefined || !Number.isFinite(costFils)) {
    return {
      sellFils: sell,
      costFils: null,
      marginFils: null,
      marginPercent: null,
      markupPercent: null,
      losing: false,
    };
  }

  const cost = Math.round(costFils);
  const marginFils = sell - cost;

  return {
    sellFils: sell,
    costFils: cost,
    marginFils,
    // Percent of the sell price: the figure a distributor quotes. Guarded
    // because a zero-priced line would otherwise divide by zero and render
    // "Infinity%" on an admin screen.
    marginPercent: sell === 0 ? null : round1((marginFils / sell) * 100),
    markupPercent: cost === 0 ? null : round1((marginFils / cost) * 100),
    // Equal prices are not a loss, but they are not a sale worth making
    // either; the screen flags both and the wording distinguishes them.
    losing: marginFils < 0,
  };
}

/**
 * A band, so a screen can colour a figure without every caller inventing its
 * own thresholds.
 *
 * "unknown" is a band of its own rather than a bad one. A product whose cost
 * has not been loaded is not a low-margin product, and colouring it as one
 * would send somebody to renegotiate a price that is fine.
 */
export type MarginBand = "unknown" | "loss" | "thin" | "fair" | "good";

export function marginBand(margin: Margin): MarginBand {
  if (margin.marginPercent === null) return "unknown";
  if (margin.marginFils !== null && margin.marginFils < 0) return "loss";
  if (margin.marginPercent < 10) return "thin";
  if (margin.marginPercent < 25) return "fair";
  return "good";
}

/* ------------------------------------------------------------------ *
 * Realised cost, under cross-dock
 * ------------------------------------------------------------------ */

/**
 * What an order line actually cost us.
 *
 * Under cross-dock nothing is bought until the cutoff, so at checkout there is
 * no supplier and therefore no cost — a cost column on the order line would
 * have had to be filled in with a guess. The real figure is the purchase order
 * lines the units came from, reached through allocations, which is also why it
 * arrives late and in pieces: a short delivery means part of a line is costed
 * and part is still on order.
 */
export type AllocationCost = {
  qty: number;
  /**
   * Snapshotted on the purchase order line when the order was raised. Null
   * when the supply had no recorded cost — which must not be read as free.
   */
  unitCostFilsSnapshot: number | null;
};

export type RealisedCost = {
  /** Units that have been received. */
  qtyReceived: number;
  /** Units received against a purchase order line that carries a cost. */
  qtyCosted: number;
  /** What those units cost, in fils. Null if none of them carry a cost. */
  costFils: number | null;
  /** True once every unit ordered has been received *and* costed. */
  complete: boolean;
  /** Units still to be bought or received. */
  qtyOutstanding: number;
  /** Received, but bought on a line with no cost recorded against it. */
  qtyUncosted: number;
};

export function realisedCost(
  qtyOrdered: number,
  allocations: AllocationCost[]
): RealisedCost {
  const ordered = Math.max(0, Math.round(qtyOrdered));

  let qtyReceived = 0;
  let qtyCosted = 0;
  let qtyUncosted = 0;
  let costFils = 0;

  for (const allocation of allocations) {
    const qty = Math.max(0, Math.round(allocation.qty));
    qtyReceived += qty;

    const unit = allocation.unitCostFilsSnapshot;
    if (unit === null || unit === undefined || !Number.isFinite(unit)) {
      qtyUncosted += qty;
      continue;
    }
    qtyCosted += qty;
    costFils += qty * Math.round(unit);
  }

  return {
    qtyReceived,
    qtyCosted,
    costFils: qtyCosted === 0 ? null : costFils,
    // Received is not enough. A line bought on a purchase order with no
    // recorded cost has arrived and still cannot be measured, and calling
    // that complete is how the whole order came to report a 100% margin.
    complete: ordered > 0 && qtyCosted >= ordered,
    qtyOutstanding: Math.max(0, ordered - qtyReceived),
    qtyUncosted,
  };
}

/**
 * Margin on an order line, from what it actually cost.
 *
 * Partly-received lines report null rather than a margin computed from half
 * the cost. A line three-fifths delivered would otherwise show a margin far
 * better than the real one, on a screen whose whole purpose is deciding
 * whether the trade is worth doing.
 */
export function lineMargin(
  lineTotalFils: number,
  qtyOrdered: number,
  allocations: AllocationCost[]
): Margin & {
  complete: boolean;
  qtyOutstanding: number;
  qtyUncosted: number;
} {
  const realised = realisedCost(qtyOrdered, allocations);
  const margin = marginOf(
    lineTotalFils,
    realised.complete ? realised.costFils : null
  );

  return {
    ...margin,
    complete: realised.complete,
    qtyOutstanding: realised.qtyOutstanding,
    qtyUncosted: realised.qtyUncosted,
  };
}

/**
 * Margin across many lines.
 *
 * Only lines with a known cost are totalled, and the count of the others is
 * returned alongside — an order total that quietly excludes two uncosted lines
 * and does not say so is the same lie as calling their cost zero.
 */
export type MarginTotal = Margin & {
  linesCosted: number;
  linesUnknown: number;
};

export function totalMargin(
  lines: { sellFils: number; costFils: number | null }[]
): MarginTotal {
  let sellFils = 0;
  let costFils = 0;
  let linesCosted = 0;
  let linesUnknown = 0;

  for (const line of lines) {
    if (line.costFils === null) {
      linesUnknown += 1;
      continue;
    }
    sellFils += Math.round(line.sellFils);
    costFils += Math.round(line.costFils);
    linesCosted += 1;
  }

  const margin =
    linesCosted === 0 ? marginOf(0, null) : marginOf(sellFils, costFils);

  return { ...margin, linesCosted, linesUnknown };
}
