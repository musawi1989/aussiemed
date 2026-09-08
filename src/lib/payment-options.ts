/**
 * How a customer pays, and what it costs them.
 *
 * Two options at checkout, and they are not equivalent:
 *
 *  - ON ACCOUNT is what this business actually does. The order is confirmed,
 *    the invoice is issued, and the goods go out under whatever that account
 *    was agreed: a Prepaid account is dispatched once the invoice is settled,
 *    an account on credit terms is dispatched and settles by its due date.
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

export type PresetPaymentTerms = "Prepaid" | "Net7" | "Net14" | "Net30" | "Net60";
export type PaymentTerms = PresetPaymentTerms | `Custom:${string}`;
export function customTerms(terms: unknown): { days: number; label: string } | null {
  if (typeof terms !== "string" || !terms.startsWith("Custom:") || terms.length > 500) return null;
  try {
    const value = JSON.parse(terms.slice(7));
    return value && Number.isInteger(value.days) && value.days >= 0 && value.days <= 365 && typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 180
      ? { days: value.days, label: value.label.trim() } : null;
  } catch { return null; }
}
export function encodeCustomTerms(days: number, label: string): PaymentTerms {
  return `Custom:${JSON.stringify({ days, label: label.trim() })}`;
}

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
export const TERM_DAYS: Record<PresetPaymentTerms, number> = {
  Prepaid: 0,
  Net7: 7,
  Net14: 14,
  Net30: 30,
  Net60: 60,
};

export const DEFAULT_TERMS: PresetPaymentTerms = "Net14";

export function isPaymentTerms(value: unknown): value is PaymentTerms {
  return typeof value === "string" && (Object.hasOwn(TERM_DAYS, value) || customTerms(value) !== null);
}

/** Days allowed, falling back to the default for anything unrecognised. */
export function termDays(terms: string | null | undefined): number {
  return customTerms(terms)?.days ?? (typeof terms === "string" && Object.hasOwn(TERM_DAYS, terms) ? TERM_DAYS[terms as PresetPaymentTerms] : TERM_DAYS[DEFAULT_TERMS]);
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
  const custom = customTerms(terms);
  if (custom) return custom.label;
  if (!isPaymentTerms(terms)) return termsLabel(DEFAULT_TERMS);
  if (terms === "Prepaid") return "Payable before dispatch";
  const days = termDays(terms);
  return days === 14 ? "14 days (two weeks)" : `${days} days`;
}

/**
 * The arrangement's own name, as a person would say it.
 *
 * "Net30" is how it is stored and how the admin screen sets it; "Net 30" is
 * how it reads to the buyer whose account it is. Separate from termsLabel,
 * which says how long they have — a buyer wants both, because the name is what
 * they will quote back on the phone and the length is what they plan around.
 */
export function termsName(terms: string | null | undefined): string {
  const custom = customTerms(terms);
  if (custom) return custom.label;
  if (!isPaymentTerms(terms)) return termsName(DEFAULT_TERMS);
  return terms === "Prepaid" ? "Prepaid" : `Net ${termDays(terms)}`;
}

/**
 * What the checkout screen and the order confirmation say about paying.
 *
 * Here rather than assembled in JSX because Prepaid is not the same SENTENCE
 * as a credit term, only a different value in one. Concatenating a label onto
 * "Due {date} — {label} from today" produced "Due 23 August 2026 — payable
 * before dispatch from today" for a guest, which is not English and was only
 * caught by reading the rendered page. A sentence with a branch in it belongs
 * somewhere a test can read it.
 *
 * INVOICE FIRST, THEN DISPATCH. The old copy said we dispatch and then invoice,
 * which is backwards: the invoice is raised when the order is confirmed. What
 * differs between accounts is what happens next — a Prepaid account is
 * dispatched once that invoice is settled, an account on credit terms is
 * dispatched against the terms it was agreed and settles by the due date.
 *
 * EVERY BUYER'S TERMS ARE THEIR OWN. Nothing here has a house default beyond
 * the fallback in termDays: the value comes from the account the admin set it
 * on, so two buyers checking out at the same moment see two different
 * sentences and two different dates. `arrangement` names those terms outright
 * rather than leaving the buyer to infer them from a date, so a change made in
 * the admin screen is visible here and not merely implied.
 *
 * The caller formats the date, because a date's format is presentation and
 * this module has no opinion about locale or time zone.
 */
export type DueWording = {
  /** This account's terms, named — "Net 30 — 30 days". */
  arrangement: string;
  headline: string;
  detail: string;
};

export function dueWording(
  terms: string | null | undefined,
  formattedDueDate: string
): DueWording {
  if (terms === "Prepaid") {
    return {
      arrangement: "Prepaid — payable before dispatch",
      headline: "Due before dispatch",
      detail:
        "We confirm the order and send you the invoice. The goods are dispatched once it is settled.",
    };
  }

  const label = termsLabel(terms);
  return {
    arrangement: `${termsName(terms)} — ${label}`,
    headline: `Due ${formattedDueDate}`,
    // Counted from placement because that is what paymentDueOn counts from.
    // Copy that says "from the invoice date" while the maths says otherwise is
    // how a buyer and an accounts department end up a day apart.
    detail: `We confirm the order and send you the invoice, then dispatch in line with your agreed terms — ${label} from the day the order is placed.`,
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
