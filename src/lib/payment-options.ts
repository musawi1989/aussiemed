/**
 * How a customer pays, and what it costs them.
 *
 * Two options at checkout, and they are not equivalent:
 *
 *  - ON ACCOUNT is what this business actually does. The order ships, an
 *    invoice follows, and it is settled inside the account's agreed terms.
 *  - CARD is not connected yet. It is shown, priced and disabled, because a
 *    buyer deciding whether to open an account deserves to know what the
 *    alternative will cost before they choose, not after Stripe is wired in.
 *
 * Pure. No database, no clock of its own — the caller passes the date, so a
 * test can ask what a Tuesday in March would have said.
 */

/* ------------------------------------------------------------------ *
 * Terms
 * ------------------------------------------------------------------ */

export type PaymentTerms = "Prepaid" | "Net7" | "Net14" | "Net30" | "Net60";

/**
 * Net14 was added on 23 Aug 2026 at the client's request — an account order
 * is to be "finalised in two weeks". It is the default for a new account.
 *
 * The others stay because they are already agreed with existing accounts, and
 * an account on Net30 must keep Net30: changing what somebody was promised
 * because a default moved is how a supplier loses a customer. The checkout
 * screen therefore states the date THIS buyer's terms produce rather than
 * asserting two weeks at everybody.
 */
export const TERM_DAYS: Record<PaymentTerms, number> = {
  Prepaid: 0,
  Net7: 7,
  Net14: 14,
  Net30: 30,
  Net60: 60,
};

export const DEFAULT_TERMS: PaymentTerms = "Net14";

export function isPaymentTerms(value: unknown): value is PaymentTerms {
  return typeof value === "string" && value in TERM_DAYS;
}

/** Days allowed, falling back to the default for anything unrecognised. */
export function termDays(terms: string | null | undefined): number {
  return isPaymentTerms(terms) ? TERM_DAYS[terms] : TERM_DAYS[DEFAULT_TERMS];
}

/**
 * When the money is due.
 *
 * Prepaid returns the placement date rather than null: it is due now, which is
 * a date, and a null here would have every caller inventing its own meaning
 * for "no due date".
 */
export function paymentDueOn(
  terms: string | null | undefined,
  placedAt: Date
): Date {
  const due = new Date(placedAt.getTime());
  due.setUTCDate(due.getUTCDate() + termDays(terms));
  return due;
}

/** What to call the terms on screen. */
export function termsLabel(terms: string | null | undefined): string {
  if (!isPaymentTerms(terms)) return termsLabel(DEFAULT_TERMS);
  if (terms === "Prepaid") return "Payable before dispatch";
  const days = TERM_DAYS[terms];
  return days === 14 ? "14 days (two weeks)" : `${days} days`;
}

/**
 * The two lines the checkout screen shows about when the money is due.
 *
 * Here rather than assembled in JSX because Prepaid is not the same SENTENCE
 * as a credit term, only a different value in one. Concatenating a label onto
 * "Due {date} — {label} from today" produced "Due 23 August 2026 — payable
 * before dispatch from today" for a guest, which is not English and was only
 * caught by reading the rendered page. A sentence with a branch in it belongs
 * somewhere a test can read it.
 *
 * The caller formats the date, because a date's format is presentation and
 * this module has no opinion about locale or time zone.
 */
export function dueWording(
  terms: string | null | undefined,
  formattedDueDate: string
): { headline: string; detail: string } {
  if (terms === "Prepaid") {
    return {
      headline: "Due before dispatch",
      detail: "We confirm the order and take payment before anything ships.",
    };
  }

  const label = termsLabel(terms);
  return {
    headline: `Due ${formattedDueDate}`,
    detail: `${label} from the day the order is placed.`,
  };
}

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

/**
 * ⚠ PLACEHOLDER RATE — AC-15, and it is on the register for a reason.
 *
 * These are Stripe's published UAE card rates as of August 2026, not a rate
 * anybody at AussieMed has agreed. A negotiated rate, an international-card
 * loading and a currency-conversion charge can all move it, and this number is
 * shown to a buyer as what they will be charged. CONFIRM BEFORE STRIPE GOES
 * LIVE — the constant is here, named, so correcting it is one edit rather than
 * a hunt through copy.
 *
 * Basis points for the same reason pricing.ts uses them: 290 is exact, 0.029
 * is not, and this figure ends up added to money.
 */
export const CARD_FEE_BASIS_POINTS = 290;
export const CARD_FEE_FIXED_FILS = 100;

/** Whether card payment can actually be taken yet. Flips when Stripe is connected — IN-04. */
export const CARD_PAYMENT_AVAILABLE = false;

/**
 * What the card fee would come to on this order.
 *
 * Rounded once, half-up, at the end — the same rule pricing.ts applies to VAT,
 * so a fee shown at checkout and a fee charged later cannot differ by a fil.
 *
 * A zero or negative total has no fee rather than the fixed component alone:
 * charging AED 1.00 to process nothing is not a thing to put on a screen.
 */
export function cardFeeFils(amountFils: number): number {
  if (amountFils <= 0) return 0;
  return (
    Math.round((amountFils * CARD_FEE_BASIS_POINTS) / 10_000) +
    CARD_FEE_FIXED_FILS
  );
}

/** The order total once the card fee is on it. */
export function totalWithCardFeeFils(amountFils: number): number {
  return amountFils + cardFeeFils(amountFils);
}

/** "2.9% + AED 1.00", built from the constants so copy cannot drift from maths. */
export function cardFeeDescription(): string {
  const percent = CARD_FEE_BASIS_POINTS / 100;
  const fixed = (CARD_FEE_FIXED_FILS / 100).toFixed(2);
  return `${percent}% + AED ${fixed}`;
}
