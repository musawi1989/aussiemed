/**
 * Tax Registration Numbers, and telling a real one from a stand-in.
 *
 * A UAE TRN is fifteen digits. It is the thing that makes a document a tax
 * invoice rather than a receipt, so the site needs to hold one for the seller
 * and, where the buyer is registered, for the buyer too.
 *
 * Neither is known yet — AC-03 for ours, and the client's own customers will
 * supply theirs — but nothing downstream can be built or tested without them.
 * So there are placeholders, and this module exists to make sure a placeholder
 * can never quietly be mistaken for the real thing.
 *
 * THE RULE: a placeholder starts 9999. Every real Emirates TRN issued to date
 * begins 100, so the two cannot collide, and the test is a prefix rather than a
 * list — a placeholder invented later is recognised without anyone remembering
 * to register it here. Any document carrying one must say so on its face, every
 * time, because this site can email an invoice to a real customer and the cost
 * of a fake tax number going out under AussieMed's name is not a bug report.
 *
 * Pure. No imports at runtime.
 */

/** A UAE TRN is fifteen digits, no more and no fewer. */
export const TRN_DIGITS = 15;

/**
 * Placeholders are 9999-prefixed so they can never be confused with a real
 * TRN, which begins 100. Obvious at a glance to anyone who handles them, and
 * detectable in code without a lookup table.
 */
export const PLACEHOLDER_PREFIX = "9999";

/** Ours, until AC-03 is answered. */
export const PLACEHOLDER_SELLER_TRN = "999900000000001";

/** The demo trade account's, so the buyer-registered path can be exercised. */
export const PLACEHOLDER_BUYER_TRN = "999900000000002";

/**
 * A TRN as typed, reduced to what it actually is.
 *
 * People paste these from letterheads, emails and spreadsheets, so they arrive
 * with spaces, hyphens, a "TRN" prefix and non-breaking spaces from Word.
 * Rejecting those would be rejecting the number for the formatting around it.
 * Returns null when what is left is not fifteen digits — including when it is
 * sixteen, because a TRN with an extra digit is a typo, not a long TRN.
 */
export function normaliseTrn(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  return digits.length === TRN_DIGITS ? digits : null;
}

export function isPlaceholderTrn(trn: string | null | undefined): boolean {
  const clean = normaliseTrn(trn);
  return clean !== null && clean.startsWith(PLACEHOLDER_PREFIX);
}

/** A real one, not a stand-in. The only test that should gate a document. */
export function isRealTrn(trn: string | null | undefined): boolean {
  return normaliseTrn(trn) !== null && !isPlaceholderTrn(trn);
}

/**
 * Grouped in threes for reading aloud and checking against a letterhead.
 * Fifteen unbroken digits is a number nobody can proofread.
 */
export function formatTrn(trn: string | null | undefined): string | null {
  const clean = normaliseTrn(trn);
  if (!clean) return null;
  return clean.match(/.{1,3}/g)!.join(" ");
}

/* ------------------------------------------------------------------ *
 * Whether a document may call itself a tax invoice
 * ------------------------------------------------------------------ */

export type Compliance = {
  /** May the document be headed "Tax invoice". */
  compliant: boolean;
  /** Is any number on it a stand-in. If so, say so on the document. */
  usesPlaceholder: boolean;
  /** What is missing, in the order it should be said. */
  reasons: string[];
};

/**
 * The seller's TRN is what makes a tax invoice; the buyer's is required only
 * when the buyer is registered.
 *
 * This used to be `Boolean(organisation.trn)` in three separate files — the
 * buyer's number alone, the seller's not considered. Adding a TRN to a test
 * customer was therefore enough to head the document "Tax invoice" while
 * AussieMed had no TRN at all, on a document the admin can email out. The rule
 * is in one place now, and it reads the seller first, because that is the one
 * the law is actually about.
 */
export function invoiceCompliance(input: {
  sellerTrn: string | null | undefined;
  buyerTrn: string | null | undefined;
}): Compliance {
  const reasons: string[] = [];

  const sellerReal = isRealTrn(input.sellerTrn);
  const buyerPresent = normaliseTrn(input.buyerTrn) !== null;
  const buyerReal = isRealTrn(input.buyerTrn);

  if (!sellerReal) {
    reasons.push(
      isPlaceholderTrn(input.sellerTrn)
        ? "AussieMed's TRN is a placeholder for testing, not a real registration — AC-03."
        : "AussieMed's own TRN has not been supplied — AC-03."
    );
  }

  // A buyer with no TRN is ordinary: an unregistered business is entitled to a
  // tax invoice without one. A buyer with a PLACEHOLDER is not ordinary, and
  // saying nothing about it would be the quiet failure this module exists to
  // prevent.
  if (buyerPresent && !buyerReal) {
    reasons.push(
      "The customer's TRN is a placeholder for testing, not a real registration."
    );
  }

  return {
    compliant: sellerReal && (!buyerPresent || buyerReal),
    usesPlaceholder:
      isPlaceholderTrn(input.sellerTrn) || isPlaceholderTrn(input.buyerTrn),
    reasons,
  };
}

/**
 * The line a document prints when it is built on stand-in numbers.
 *
 * Deliberately blunt, and deliberately not softened by whoever renders it: the
 * failure this guards against is somebody emailing a test invoice to a real
 * customer and neither of them noticing.
 */
export const PLACEHOLDER_NOTICE =
  "TEST DOCUMENT — this carries placeholder tax registration numbers and " +
  "is not valid for accounting or for filing.";
