/**
 * Variant families and packaging levels.
 *
 * Kept in its own module because these are regex-heavy, and generating regexes
 * through a shell has twice now written literal control characters into the
 * source — a `\b` becoming byte 0x08, which looks correct in every editor and
 * matches nothing. This file is only ever edited directly.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Variant families
 * ------------------------------------------------------------------ */

/**
 * The same line in 375ml and 60ml, or in five glove sizes, is several products
 * that a buyer thinks of as one thing. Grouping them lets each product offer a
 * dropdown of its siblings, so someone who lands on the wrong size does not
 * have to search again.
 *
 * The family key is the product name with its size, volume and pack count
 * stripped out. Crude, but it groups the cases a buyer would expect and does
 * not merge two genuinely different lines.
 */
const SIZE_TOKEN =
  /\b\d+(?:\.\d+)?\s?(?:ml|mls|l|ltr|litre|g|gm|kg|mm|cm|pieces?|pcs?|pack|sheets?|tablets?|capsules?)\b/gi;

const SIZE_WORD =
  /\b(?:extra small|x-?small|small|medium|large|extra large|x-?large|universal|junior|senior)\b/gi;

export function variantKeyFor(name, brand) {
  const stripped = name
    .replace(SIZE_TOKEN, " ")
    .replace(SIZE_WORD, " ")
    .replace(/[,\-–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // The brand stays in the key so two brands' "hand sanitiser" never merge.
  return `${(brand ?? "").toLowerCase()}|${stripped}`;
}

/** What distinguishes this member of the family — the size just stripped out. */
export function variantLabelFor(name) {
  const size = name.match(SIZE_TOKEN);
  if (size?.length) {
    // Last match: "Ultra 375Ml" describes the product by its volume, and a
    // trailing size is more likely the variant than a leading one.
    return size[size.length - 1].replace(/\s+/g, "").toLowerCase();
  }
  const word = name.match(SIZE_WORD);
  if (word?.length) {
    const raw = word[word.length - 1].toLowerCase();
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Packaging levels
 * ------------------------------------------------------------------ */

/**
 * A trade buyer does not order twelve because twelve is cheaper — they order a
 * carton, and a carton happens to hold twelve. The price break and the
 * packaging level are the same fact, so each break carries the level's name.
 *
 * INVENTED QUANTITIES. How many units make a carton, and how many cartons make
 * a box, differ per product and have not been supplied. These are plausible
 * defaults so the model can be reviewed — see DA-20 in the register.
 * [unitsPerCarton, cartonsPerBox]
 */
const PACKAGING = {
  glove: [10, 5],
  mask: [20, 5],
  respirator: [20, 5],
  syringe: [10, 10],
  needle: [10, 10],
  lancet: [10, 10],
  wipe: [6, 4],
  tissue: [6, 4],
  swab: [25, 2],
  gauze: [25, 2],
  bandage: [24, 2],
  dressing: [24, 2],
  tape: [24, 2],
  sanitiser: [12, 4],
  sanitizer: [12, 4],
  sunscreen: [12, 4],
  toothpaste: [12, 4],
  thermometer: [6, 2],
  default: [12, 4],
};

export function packagingFor(name) {
  const key =
    Object.keys(PACKAGING).find(
      (k) => k !== "default" && new RegExp(k, "i").test(name)
    ) ?? "default";

  const [unitsPerCarton, cartonsPerBox] = PACKAGING[key];
  return {
    unitsPerCarton,
    cartonsPerBox,
    unitsPerBox: unitsPerCarton * cartonsPerBox,
  };
}

/**
 * Turns the packaging hierarchy into named price breaks: buy a carton, get the
 * carton price; buy a box of cartons, get the box price.
 *
 * INVENTED DISCOUNTS: 4% at carton, 8% at box. The real figures are the
 * client's to set — DA-20.
 */
export function packagingTiers(basePriceAED, name) {
  const { unitsPerCarton, unitsPerBox, cartonsPerBox } = packagingFor(name);

  return [
    {
      minQty: unitsPerCarton,
      priceAED: round2(basePriceAED * 0.96),
      unitName: "Carton",
      unitsPerLevel: unitsPerCarton,
    },
    {
      minQty: unitsPerBox,
      priceAED: round2(basePriceAED * 0.92),
      unitName: "Box",
      unitsPerLevel: cartonsPerBox,
    },
  ].filter((t) => t.priceAED < basePriceAED && t.minQty > 1);
}
