import "server-only";

import { db } from "./db";
import { PLACEHOLDER_SELLER_TRN, normaliseTrn } from "./trn";

/**
 * Who AussieMed is on a tax document.
 *
 * Held as settings rather than in code so the real details can be entered the
 * day they arrive, without a deploy — the same reasoning as the VAT rate and
 * the daily cutoff. Until then it answers with a placeholder that every
 * document is required to declare, so the whole invoicing path can be built
 * and tested against a TRN-shaped thing that nobody can mistake for a real
 * registration.
 *
 * AC-03 for the TRN and LG-06 for the trade licence stay open. A placeholder
 * makes the software testable; it does not answer the question, and this file
 * is deliberately not where it gets answered.
 */

export const SELLER_TRN_KEY = "sellerTrn";
export const SELLER_LICENCE_KEY = "sellerTradeLicence";
export const SELLER_ADDRESS_KEY = "sellerAddress";

export type SellerIdentity = {
  name: string;
  trn: string;
  tradeLicence: string | null;
  address: string;
};

/** Fixed until the client supplies otherwise — LG-06. */
const NAME = "AussieMed";
const DEFAULT_ADDRESS = "United Arab Emirates";

export async function sellerIdentity(): Promise<SellerIdentity> {
  const rows = await db.setting.findMany({
    where: {
      key: { in: [SELLER_TRN_KEY, SELLER_LICENCE_KEY, SELLER_ADDRESS_KEY] },
    },
    select: { key: true, value: true },
  });
  const value = (key: string) => rows.find((r) => r.key === key)?.value ?? null;

  return {
    name: NAME,
    // A stored value that is not fifteen digits is treated as absent and falls
    // back to the placeholder, rather than being printed on an invoice. A
    // half-typed TRN on a tax document is worse than an obviously fake one.
    trn: normaliseTrn(value(SELLER_TRN_KEY)) ?? PLACEHOLDER_SELLER_TRN,
    tradeLicence: value(SELLER_LICENCE_KEY)?.trim() || null,
    address: value(SELLER_ADDRESS_KEY)?.trim() || DEFAULT_ADDRESS,
  };
}
