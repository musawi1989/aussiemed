import type { PriceTier } from "./types";

/**
 * Currency rules, in one place so they cannot drift.
 *
 * v1 is AED only. The string is always the English "AED" — never a localised
 * symbol. Amounts always render with exactly two decimals; quantities are
 * always integers.
 */
export const CURRENCY = "AED" as const;
export const VAT_RATE = 0.05;

/** Rounds to 2dp using half-up, avoiding the float drift of toFixed alone. */
export function round2(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** `formatAED(35.97)` -> `"AED 35.97"`. Always 2dp, always thousands-grouped. */
export function formatAED(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const body = Math.abs(safe).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safe < 0 ? "-" : ""}${CURRENCY} ${body}`;
}

/** Quantities are whole units. Never render "3.00" for a quantity. */
export function formatQty(qty: number): string {
  return String(Math.max(0, Math.trunc(qty)));
}

export function normaliseQty(input: number, min = 1): number {
  if (!Number.isFinite(input)) return min;
  return Math.max(min, Math.trunc(input));
}

/**
 * Unit price for a given quantity: the best (highest-threshold) tier the
 * quantity qualifies for, falling back to the base price.
 *
 * Tiers are stored ascending by minQty with strictly decreasing prices — see
 * scripts/build-catalog.mjs, which normalises the malformed source rows.
 */
export function unitPriceFor(
  basePriceAED: number,
  tiers: PriceTier[],
  qty: number
): number {
  const q = normaliseQty(qty);
  let price = basePriceAED;
  for (const tier of tiers) {
    if (q >= tier.minQty) price = tier.priceAED;
  }
  return round2(price);
}

/** The next unmet volume break, for the "buy N more to save" nudge. */
export function nextTierFor(
  tiers: PriceTier[],
  qty: number
): PriceTier | null {
  const q = normaliseQty(qty);
  return tiers.find((tier) => q < tier.minQty) ?? null;
}

export function lineTotal(
  basePriceAED: number,
  tiers: PriceTier[],
  qty: number
): number {
  return round2(unitPriceFor(basePriceAED, tiers, qty) * normaliseQty(qty));
}

export type CartTotals = {
  subtotalAED: number;
  vatAED: number;
  totalAED: number;
  itemCount: number;
};

export function totalsFor(
  lines: { basePriceAED: number; tiers: PriceTier[]; qty: number }[]
): CartTotals {
  const subtotal = round2(
    lines.reduce(
      (sum, line) => sum + lineTotal(line.basePriceAED, line.tiers, line.qty),
      0
    )
  );
  const vat = round2(subtotal * VAT_RATE);
  return {
    subtotalAED: subtotal,
    vatAED: vat,
    totalAED: round2(subtotal + vat),
    itemCount: lines.reduce((sum, line) => sum + normaliseQty(line.qty), 0),
  };
}

/** Percentage saved against the base price, for tier badges. */
export function savingPercent(basePriceAED: number, tierPriceAED: number): number {
  if (basePriceAED <= 0) return 0;
  return Math.round(((basePriceAED - tierPriceAED) / basePriceAED) * 100);
}
