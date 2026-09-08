/**
 * What a buyer saved, and why — for the order summary and every invoice.
 *
 * pricing.ts decides what a line COSTS. This decides what to SAY about it. The
 * two are separate because a saving is a claim made to a customer: it appears
 * on a document they may hand to their own finance team, and it has to be
 * defensible line by line.
 *
 * TWO KINDS OF DISCOUNT, NEVER BOTH ON ONE LINE:
 *
 *  - an ACCOUNT DISCOUNT, a percentage off list on everything they buy;
 *  - an AGREED PRICE for one SKU, negotiated, which wins outright and does not
 *    have the account discount stacked on it.
 *
 * That precedence is pricing.ts's rule (accountUnitPriceFils) and this module
 * only reports it. If the two ever both applied to a line, the figures here
 * would still be right — they are computed from the prices, not re-derived
 * from the rules — but the label would have to choose, and it would be lying
 * about one of them.
 *
 * ⚠ AN UNKNOWN SAVING IS NOT A ZERO SAVING. Orders placed before the list
 * price was snapshotted have nothing to compare against, and the honest answer
 * is silence: `unknown` is true, `savingFils` is zero, and `discounted` is
 * false, so a caller that renders "You saved AED 0.00" has to opt into it.
 * Recomputing the comparison from today's list price would restate an invoice
 * that has already been sent — the platform's rule everywhere else, and the
 * reason nameSnapshot and vatRateBasisPoints exist.
 *
 * Pure. No database, no clock. Everything is fils and basis points, integers
 * throughout, for the reason pricing.ts states: money that round-trips through
 * a float ends up a fils out.
 */

export type DiscountSource = "AgreedPrice" | "AccountDiscount";

export function isDiscountSource(value: unknown): value is DiscountSource {
  return value === "AgreedPrice" || value === "AccountDiscount";
}

/** An order line, or a cart line — both carry the same four numbers. */
export type DiscountableLine = {
  qty: number;
  unitPriceFils: number;
  lineTotalFils: number;
  /**
   * What one unit would have cost at this quantity without the account's
   * terms. Null or undefined on an order placed before we recorded it.
   */
  listUnitPriceFils?: number | null;
  /** "AgreedPrice" | "AccountDiscount", or null when the line was at list. */
  discountSource?: string | null;
};

export type LineDiscount = {
  /** Null when there is nothing to compare against. */
  listUnitPriceFils: number | null;
  listLineTotalFils: number | null;
  unitPriceFils: number;
  lineTotalFils: number;
  /** Off this line in total, not per unit. Zero when unknown. */
  savingFils: number;
  /** In basis points off the list line total. 1250 = 12.5%. */
  savingBasisPoints: number;
  source: DiscountSource | null;
  /** There is a saving worth showing. */
  discounted: boolean;
  /** We hold no list price for this line, so no saving can be claimed. */
  unknown: boolean;
};

/**
 * One line's saving.
 *
 * A saving is never negative. An agreed price can sit ABOVE the list price of
 * the day — an arrangement made a year ago against a break added since — and
 * that is a real state of affairs, not a rounding error: the source stays
 * "AgreedPrice" so the document can still say the price was agreed, while
 * `discounted` is false so nobody prints a saving that does not exist. Someone
 * reading the account then gets to notice the arrangement has gone stale.
 */
export function lineDiscount(line: DiscountableLine): LineDiscount {
  const qty = Math.max(0, Math.trunc(line.qty));
  const unitPriceFils = Math.trunc(line.unitPriceFils);
  const lineTotalFils = Math.trunc(line.lineTotalFils);
  const source = isDiscountSource(line.discountSource) ? line.discountSource : null;

  const list = line.listUnitPriceFils;
  if (list === null || list === undefined || !Number.isFinite(list)) {
    return {
      listUnitPriceFils: null,
      listLineTotalFils: null,
      unitPriceFils,
      lineTotalFils,
      savingFils: 0,
      savingBasisPoints: 0,
      source,
      discounted: false,
      unknown: true,
    };
  }

  const listUnitPriceFils = Math.max(0, Math.trunc(list));
  const listLineTotalFils = listUnitPriceFils * qty;
  const savingFils = Math.max(0, listLineTotalFils - lineTotalFils);

  return {
    listUnitPriceFils,
    listLineTotalFils,
    unitPriceFils,
    lineTotalFils,
    savingFils,
    // Guarded against a zero list price, which would divide by zero and put
    // NaN% on an invoice for a line given away free.
    savingBasisPoints:
      listLineTotalFils > 0
        ? Math.round((savingFils / listLineTotalFils) * 10_000)
        : 0,
    source,
    discounted: savingFils > 0,
    unknown: false,
  };
}

export type OrderDiscount = {
  /** What the order would have come to at list. Null when nothing is known. */
  listSubtotalFils: number | null;
  subtotalFils: number;
  savingFils: number;
  savingBasisPoints: number;
  /** How many lines we hold no list price for — the saving excludes them. */
  unknownLines: number;
  discounted: boolean;
  /** Which kinds of arrangement are in play, for the wording. */
  sources: DiscountSource[];
  /**
   * The saving split by where it came from, so a summary can show the account
   * discount and the negotiated prices as separate rows.
   *
   * One row reading "Discount AED 40.00" against an order that got 2.5% off
   * everything and a tendered rate on one SKU tells the buyer neither of the
   * two things they want to check.
   */
  savingBySource: Record<DiscountSource, number>;
};

/**
 * The order's saving, summed from its lines.
 *
 * THE PERCENTAGE IS COMPUTED FROM THE TOTALS, never averaged across lines. An
 * order of one heavily discounted pen and forty boxes at list is not "50% off
 * on average", and a mean of line percentages ignores that the lines are
 * different sizes.
 *
 * A MIXED ORDER UNDERSTATES RATHER THAN OVERSTATES. Lines with no list price
 * contribute their actual total to the subtotal and nothing to the saving, so
 * the percentage is measured against only what could be compared — and
 * `unknownLines` is there so a caller can say so instead of implying the whole
 * order was checked.
 */
export function orderDiscount(lines: readonly DiscountableLine[]): OrderDiscount {
  const each = lines.map(lineDiscount);
  const known = each.filter((line) => !line.unknown);

  const subtotalFils = each.reduce((sum, line) => sum + line.lineTotalFils, 0);
  const savingFils = known.reduce((sum, line) => sum + line.savingFils, 0);
  const comparedListFils = known.reduce(
    (sum, line) => sum + (line.listLineTotalFils ?? 0),
    0
  );

  const sources: DiscountSource[] = [];
  const savingBySource: Record<DiscountSource, number> = {
    AgreedPrice: 0,
    AccountDiscount: 0,
  };
  for (const line of each) {
    if (line.source && !sources.includes(line.source)) sources.push(line.source);
    // Only a line that actually saved money adds to a total. A stale agreed
    // price sitting above list is named on its line and contributes nothing.
    if (line.source && line.savingFils > 0) {
      savingBySource[line.source] += line.savingFils;
    }
  }

  return {
    listSubtotalFils:
      known.length === 0
        ? null
        : comparedListFils +
          each
            .filter((line) => line.unknown)
            .reduce((sum, line) => sum + line.lineTotalFils, 0),
    subtotalFils,
    savingFils,
    savingBasisPoints:
      comparedListFils > 0
        ? Math.round((savingFils / comparedListFils) * 10_000)
        : 0,
    unknownLines: each.length - known.length,
    discounted: savingFils > 0,
    sources,
    savingBySource,
  };
}

/** What to call a whole row of savings on a summary. */
export function sourceLabel(
  source: DiscountSource,
  accountBasisPoints?: number
): string {
  if (source === "AgreedPrice") return "Agreed prices";
  // The rate the account was actually given, when the caller knows it. Derived
  // percentages drift: rounding on the lines can turn an agreed 2.5% into
  // "2.49% off", and a customer checking their contract would be right to
  // query it.
  return accountBasisPoints && accountBasisPoints > 0
    ? `Account discount ${formatBasisPoints(accountBasisPoints)}`
    : "Account discount";
}

/**
 * Basis points as a percentage a person would write.
 *
 * 250 → "2.5%", 500 → "5%", 1000 → "10%". Trailing zeros trimmed, because
 * "5.00%" on an invoice reads as a precision we are not claiming, and exact
 * integer arithmetic all the way here means the two decimals never carry
 * information anyway.
 */
export function formatBasisPoints(basisPoints: number): string {
  if (!Number.isFinite(basisPoints)) return "0%";
  const percent = Math.round(basisPoints) / 100;
  return `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * What to call this line's discount on a document.
 *
 * Named per line rather than once per order because an order can hold both
 * kinds, and "2.5% account discount" printed against a line bought at an
 * agreed price would be a specific, checkable false statement.
 *
 * ⚠ PASS THE ACCOUNT'S RATE. Without it the percentage is derived from this
 * line, and a derived percentage is not the agreed one: 2.5% off AED 15.90 is
 * 39.75 fils, which rounds to 40, and 40/1590 reads back as **2.52%**. A
 * customer holding a contract that says 2.5% would be right to query an
 * invoice that says 2.52%, and they would be querying a rounding artefact.
 * Caught by putting a real order through checkout and reading the summary —
 * every unit test here passed, because they were all fed figures that divide.
 *
 * The derived figure is still the fallback, because a line can be discounted
 * on an order whose account rate we no longer hold, and "2.52% off list" is
 * closer to the truth than silence.
 */
export function discountLabel(
  discount: LineDiscount,
  accountBasisPoints?: number
): string | null {
  if (discount.source === "AgreedPrice") return "Agreed price";
  if (!discount.discounted) return null;

  const rate =
    discount.source === "AccountDiscount" &&
    accountBasisPoints !== undefined &&
    accountBasisPoints > 0
      ? accountBasisPoints
      : discount.savingBasisPoints;

  return `${formatBasisPoints(rate)} off list`;
}
