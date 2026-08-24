/**
 * Reading a discount and an agreed price off a form.
 *
 * Pure, and separate from customer-admin.ts, which is server-only and touches
 * the database. Both of these turn what somebody typed into an exact integer,
 * and getting that wrong is a wrong price on a real invoice — so it is the
 * part that gets tested.
 *
 * A PERSON TYPES A PERCENTAGE; THE DATABASE STORES BASIS POINTS. Nobody
 * negotiates "250 basis points off", and nothing should store 2.5 as a float.
 * The conversion happens once, here.
 */

/** Nobody has ever agreed more than this, and a typo can reach it. */
const MAX_DISCOUNT_PERCENT = 90;

export type DiscountCheck =
  { ok: true; basisPoints: number } | { ok: false; error: string };

/**
 * "2.5" becomes 250 basis points. Blank becomes none.
 *
 * Two decimal places, because a basis point IS a hundredth of a percent and
 * anything finer cannot be stored. Refused rather than rounded: silently
 * turning 2.505% into 2.5% is a figure nobody agreed appearing on an invoice.
 */
export function checkDiscount(raw: string | null | undefined): DiscountCheck {
  const text = (raw ?? "").trim().replace(/%$/, "").trim();

  // Blank and "0" both mean no discount. Blank is the common one — somebody
  // clearing the box — and refusing it would make "no discount" unreachable.
  if (!text) return { ok: true, basisPoints: 0 };

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    // Named cases first, because "that is not a number" sends somebody
    // looking for a typo they have not made.
    if (/^\d+\.\d{3,}$/.test(text)) {
      return {
        ok: false,
        error:
          "A discount can go to two decimal places — 2.5% or 2.55%, not finer.",
      };
    }
    if (text.startsWith("-")) {
      return {
        ok: false,
        error: "A discount cannot be negative. Leave it blank for none.",
      };
    }
    return { ok: false, error: `"${text}" is not a percentage.` };
  }

  const percent = Number(text);
  if (percent > MAX_DISCOUNT_PERCENT) {
    return {
      ok: false,
      error: `${percent}% is almost certainly a slip. The most that can be set here is ${MAX_DISCOUNT_PERCENT}%.`,
    };
  }

  // ×100 with a round, not a cast: 2.5 * 100 is 250 exactly, but 8.87 * 100
  // is 886.9999999999999 in binary floating point, and a cast would store 886.
  return { ok: true, basisPoints: Math.round(percent * 100) };
}

export type PriceCheck =
  { ok: true; fils: number } | { ok: false; error: string };

/** A price high enough to be a mistake rather than a bulk deal. */
const MAX_PRICE_AED = 1_000_000;

/**
 * "17.15" becomes 1715 fils.
 *
 * ZERO IS ALLOWED and is not the same as blank. A free item on a tender is a
 * real arrangement, and the pricing rules treat an agreed zero as an
 * agreement rather than as an absent one. Blank is refused: a row with no
 * price is not an agreement, it is a row somebody has to interpret.
 */
export function checkAgreedPrice(raw: string | null | undefined): PriceCheck {
  const text = (raw ?? "")
    .trim()
    .replace(/^AED\s*/i, "")
    .replace(/,/g, "")
    .trim();

  if (!text) {
    return {
      ok: false,
      error: "What price has been agreed? Enter 0 for a free item.",
    };
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    if (/^\d+\.\d{3,}$/.test(text)) {
      return {
        ok: false,
        error: "A price goes to two decimal places — 17.15, not finer.",
      };
    }
    if (text.startsWith("-")) {
      return { ok: false, error: "A price cannot be negative." };
    }
    return { ok: false, error: `"${text}" is not an amount in AED.` };
  }

  const aed = Number(text);
  if (aed > MAX_PRICE_AED) {
    return { ok: false, error: `AED ${aed} is almost certainly a slip.` };
  }

  // Same reason as above: 17.15 * 100 is 1714.9999999999998 as a float.
  return { ok: true, fils: Math.round(aed * 100) };
}

/** Basis points back to something a person reads. 250 becomes "2.5%". */
export function discountLabel(basisPoints: number): string {
  if (!basisPoints) return "None";
  // Trailing zeros dropped: "2.5%" rather than "2.50%", and "10%" rather
  // than "10.00%".
  const percent = (basisPoints / 100).toFixed(2).replace(/\.?0+$/, "");
  return `${percent}%`;
}
