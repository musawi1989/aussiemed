import type { Pack, PriceTier, Product, TaxClass } from "./types";

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
 * "2 boxes", "1 bottle", "12 packs" — a quantity said in its own unit.
 *
 * "Each" is the catalogue's word for a product sold singly, and it is a unit
 * name, not something a buyer says: "2 eaches in your cart" is not English.
 * When that is the unit, the count carries itself and the word is dropped.
 *
 * Everything else takes a plain English plural. The sibilant endings need "es"
 * ("box" -> "boxes", not "boxs") and a consonant before a final "y" turns it
 * into "ies" ("tray" keeps its y, "ply" does not). Catalogue units are short
 * concrete nouns — box, bottle, pack, roll, carton, tube — so these rules
 * cover them; anything irregular arriving later belongs in a lookup here
 * rather than at a call site.
 */
export function pluraliseUnit(unit: string | null, qty: number): string {
  const word = (unit ?? "").trim().toLowerCase();
  if (!word || word === "each") return "";
  if (Math.abs(qty) === 1) return word;

  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
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

/**
 * VAT rate for a line. A defined list of medical supplies is zero-rated in the
 * UAE, and charging 5% on those overstates a tax document the customer keeps.
 */
export function vatRateFor(taxClass: TaxClass): number {
  return taxClass === "zero-rated" ? 0 : VAT_RATE;
}

export type CartTotals = {
  subtotalAED: number;
  vatAED: number;
  totalAED: number;
  itemCount: number;
  /** Portion of the subtotal that attracted no VAT. */
  zeroRatedAED: number;
};

export type PriceableLine = {
  basePriceAED: number;
  tiers: PriceTier[];
  qty: number;
  taxClass: TaxClass;
};

export function totalsFor(lines: PriceableLine[]): CartTotals {
  let subtotal = 0;
  let vat = 0;
  let zeroRated = 0;

  // VAT is accumulated per line and rounded once at the end. Rounding each
  // line's VAT before summing drifts against the per-supplier invoice split.
  for (const line of lines) {
    const net = lineTotal(line.basePriceAED, line.tiers, line.qty);
    subtotal += net;
    vat += net * vatRateFor(line.taxClass);
    if (line.taxClass === "zero-rated") zeroRated += net;
  }

  const subtotalR = round2(subtotal);
  const vatR = round2(vat);

  return {
    subtotalAED: subtotalR,
    vatAED: vatR,
    totalAED: round2(subtotalR + vatR),
    itemCount: lines.reduce((sum, line) => sum + normaliseQty(line.qty), 0),
    zeroRatedAED: round2(zeroRated),
  };
}

/** Resolves the pack a buyer selected, falling back to the product default. */
export function packFor(product: Product, packId?: string): Pack {
  return (
    product.packs.find((p) => p.id === packId) ??
    product.packs.find((p) => p.id === product.defaultPackId) ??
    product.packs[0]
  );
}

/**
 * Price shown to the buyer, honouring their Ex/Inc VAT preference. Trade
 * buyers compare ex-VAT; the person approving the invoice reads inc-VAT.
 */
export function displayPrice(
  netAED: number,
  taxClass: TaxClass,
  includeVat: boolean
): number {
  return includeVat ? round2(netAED * (1 + vatRateFor(taxClass))) : round2(netAED);
}

/** Per-base-unit price, so a box and a carton can be compared honestly. */
export function pricePerEach(pack: Pack, qty = 1): number {
  const each = pack.eachesPerPack > 0 ? pack.eachesPerPack : 1;
  return round2(unitPriceFor(pack.priceAED, pack.tiers, qty) / each);
}

/** Percentage saved against the base price, for tier badges. */
export function savingPercent(basePriceAED: number, tierPriceAED: number): number {
  if (basePriceAED <= 0) return 0;
  return Math.round(((basePriceAED - tierPriceAED) / basePriceAED) * 100);
}
