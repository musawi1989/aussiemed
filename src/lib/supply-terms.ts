/**
 * What a supplier is allowed to tell us about the packs they supply.
 *
 * Pure: no database, no imports. The same rules decide whether a single edit
 * in the portal is acceptable and whether a row in an uploaded spreadsheet is,
 * so the two cannot drift into disagreeing about what a valid cost is.
 *
 * The boundary this file draws matters as much as the validation. A supplier
 * may set their own part number, their own price to us, their own lead time,
 * and whether they can currently supply. They may not decide which products
 * they supply — that pairing is ours, set in the admin — and nothing here
 * touches what AussieMed sells for. See BE-21 and DEC-25.
 */

export type SupplyTermsInput = {
  /** Their code for the item. Blank clears it. */
  supplierPartNumber?: string | null;
  /** What they charge us, in AED as typed. Blank means "not recorded". */
  costAED?: string | number | null;
  /** Days from order to dispatch. Blank clears it and falls back to theirs. */
  leadTimeDays?: string | number | null;
};

/**
 * Whether they can supply is deliberately not here.
 *
 * It used to be, as a boolean, and it has become a three-way state with a
 * suggested replacement attached — see supply-state.ts. Keeping a copy of it
 * on this type would mean two places deciding the same thing, and the one that
 * lost would be found months later by an order going to the wrong supplier.
 */
export type SupplyTerms = {
  supplierPartNumber: string | null;
  costFils: number | null;
  leadTimeDays: number | null;
};

export type TermsResult =
  | { ok: true; terms: SupplyTerms }
  | { ok: false; error: string };

export const MAX_PART_NUMBER = 60;
/** A year. Anything beyond it is a typo, not a lead time. */
export const MAX_LEAD_TIME_DAYS = 365;
/** AED 100,000 for one pack. Above this it is a decimal point in the wrong place. */
export const MAX_COST_FILS = 10_000_000;

const blank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

/**
 * Reads a money value the way a person types it: "12.34", "AED 12.34",
 * "12,34" is refused rather than guessed at, and a bare "12" means 12.00.
 *
 * Returns fils, because money is never a float here.
 */
export function parseCostToFils(
  value: string | number | null | undefined
): { ok: true; fils: number | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, fils: null };

  const typed = String(value).trim();
  const withoutCurrency = typed.replace(/^AED\s*/i, "");

  /**
   * Commas are stripped only where they are genuinely thousands separators.
   *
   * "12,34" is a decimal comma in half the world. Stripping it blindly turns
   * AED 12.34 into AED 1,234.00 — a hundredfold error, on a cost, arriving
   * quietly through a spreadsheet. It is refused instead, so the supplier is
   * asked rather than guessed at.
   */
  let raw = withoutCurrency;
  if (withoutCurrency.includes(",")) {
    if (!/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(withoutCurrency)) {
      return {
        ok: false,
        error:
          `"${typed}" is ambiguous — a comma here could be a decimal point or a ` +
          `thousands separator. Write it as 12.34 or 1234.56.`,
      };
    }
    raw = withoutCurrency.replace(/,/g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return {
      ok: false,
      error: `"${typed}" is not a price. Use digits and at most two decimals, for example 12.34.`,
    };
  }

  // Via string rather than arithmetic: 12.34 * 100 is 1233.9999999999998.
  const [whole, decimals = ""] = raw.split(".");
  const fils = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));

  if (fils <= 0) {
    return { ok: false, error: "A cost must be more than zero. Leave it blank if it is not agreed yet." };
  }
  if (fils > MAX_COST_FILS) {
    return {
      ok: false,
      error: `AED ${(fils / 100).toFixed(2)} for one pack looks like a misplaced decimal point.`,
    };
  }

  return { ok: true, fils };
}

export function parseLeadTime(
  value: string | number | null | undefined
): { ok: true; days: number | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, days: null };

  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) {
    return { ok: false, error: `"${raw}" is not a number of days.` };
  }

  const days = Number(raw);
  if (days > MAX_LEAD_TIME_DAYS) {
    return {
      ok: false,
      error: `${days} days is longer than a year — check the figure.`,
    };
  }
  return { ok: true, days };
}

/**
 * Reads yes/no as a person writes it in a spreadsheet.
 *
 * Blank means "no change intended", which is why it returns null rather than
 * defaulting to true: a supplier leaving the column empty must not silently
 * mark every line available again.
 */
export function parseAvailability(
  value: string | number | boolean | null | undefined
): { ok: true; available: boolean | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, available: null };
  if (typeof value === "boolean") return { ok: true, available: value };

  const raw = String(value).trim().toLowerCase();
  if (["yes", "y", "true", "1", "available", "in stock"].includes(raw)) {
    return { ok: true, available: true };
  }
  if (["no", "n", "false", "0", "unavailable", "out of stock"].includes(raw)) {
    return { ok: true, available: false };
  }
  return {
    ok: false,
    error: `"${String(value).trim()}" is not yes or no.`,
  };
}

export function checkSupplyTerms(input: SupplyTermsInput): TermsResult {
  const partNumber = (input.supplierPartNumber ?? "").trim().replace(/\s+/g, " ");
  if (partNumber.length > MAX_PART_NUMBER) {
    return {
      ok: false,
      error: `Part numbers are limited to ${MAX_PART_NUMBER} characters.`,
    };
  }

  const cost = parseCostToFils(input.costAED);
  if (!cost.ok) return { ok: false, error: cost.error };

  const lead = parseLeadTime(input.leadTimeDays);
  if (!lead.ok) return { ok: false, error: lead.error };

  return {
    ok: true,
    terms: {
      supplierPartNumber: partNumber || null,
      costFils: cost.fils,
      leadTimeDays: lead.days,
      // isAvailable is not set here. It is derived from supplyStatus by
      // src/lib/supply-state.ts, and the service layer writes both together —
      // setting it in two places is how the two would come to disagree.
    },
  };
}

/* ------------------------------------------------------------------ *
 * The bulk file
 * ------------------------------------------------------------------ */

/**
 * The columns a supplier's file must have.
 *
 * Our SKU code is the key, and it is the only column a supplier cannot
 * change: it is how we know which pack a row is about. Their own part number
 * is a value like any other.
 */
export const SUPPLY_COLUMNS = [
  "AussieMed item code",
  "Your part number",
  "Your price (AED)",
  "Lead time (days)",
  "Can you supply it? (yes/no)",
] as const;

export type SupplyUploadRow = {
  /** 1-based, as the spreadsheet shows it, so an error can be found. */
  rowNumber: number;
  skuCode: string;
  supplierPartNumber: string | null;
  costFils: number | null;
  leadTimeDays: number | null;
  /** Null when the column was left blank: no change intended. */
  isAvailable: boolean | null;
};

export type RowProblem = { rowNumber: number; column: string; message: string };

export type ParsedUpload = {
  rows: SupplyUploadRow[];
  problems: RowProblem[];
};

/**
 * Turns raw cells into rows we can apply, reporting every problem rather than
 * stopping at the first.
 *
 * A supplier fixing a fifty-line file one error per upload would give up, and
 * the register already records that partial feedback is what makes bulk tools
 * go unused.
 */
export function parseSupplyRows(
  cells: (string | number | boolean | null | undefined)[][]
): ParsedUpload {
  const rows: SupplyUploadRow[] = [];
  const problems: RowProblem[] = [];
  const seen = new Map<string, number>();

  cells.forEach((cell, index) => {
    // Row 1 is the header, so the first data row is spreadsheet row 2.
    const rowNumber = index + 2;
    const skuCode = String(cell[0] ?? "").trim();

    // A wholly blank row is padding, not an error.
    if (!skuCode && cell.slice(1).every((v) => blank(v))) return;

    if (!skuCode) {
      problems.push({
        rowNumber,
        column: SUPPLY_COLUMNS[0],
        message: "Every row needs the AussieMed item code — it is how we know which pack you mean.",
      });
      return;
    }

    const already = seen.get(skuCode.toLowerCase());
    if (already) {
      problems.push({
        rowNumber,
        column: SUPPLY_COLUMNS[0],
        message: `${skuCode} is already on row ${already}. Two rows for one pack cannot both be right.`,
      });
      return;
    }
    seen.set(skuCode.toLowerCase(), rowNumber);

    const cost = parseCostToFils(cell[2] as string);
    if (!cost.ok) {
      problems.push({ rowNumber, column: SUPPLY_COLUMNS[2], message: cost.error });
      return;
    }

    const lead = parseLeadTime(cell[3] as string);
    if (!lead.ok) {
      problems.push({ rowNumber, column: SUPPLY_COLUMNS[3], message: lead.error });
      return;
    }

    const available = parseAvailability(cell[4]);
    if (!available.ok) {
      problems.push({ rowNumber, column: SUPPLY_COLUMNS[4], message: available.error });
      return;
    }

    const partNumber = String(cell[1] ?? "").trim().replace(/\s+/g, " ");
    if (partNumber.length > MAX_PART_NUMBER) {
      problems.push({
        rowNumber,
        column: SUPPLY_COLUMNS[1],
        message: `Part numbers are limited to ${MAX_PART_NUMBER} characters.`,
      });
      return;
    }

    rows.push({
      rowNumber,
      skuCode,
      supplierPartNumber: partNumber || null,
      costFils: cost.fils,
      leadTimeDays: lead.days,
      isAvailable: available.available,
    });
  });

  return { rows, problems };
}

/**
 * Splits parsed rows into the ones we can apply and the ones about packs this
 * supplier is not set up for.
 *
 * A supplier cannot add themselves to a product. Which suppliers can supply
 * what is a commercial decision made in the admin, and a spreadsheet that
 * could create the pairing would let a supplier appoint themselves — quietly,
 * in bulk, and to a competitor's line.
 */
export function splitByKnownSkus(
  rows: SupplyUploadRow[],
  suppliedSkuCodes: string[]
): { applicable: SupplyUploadRow[]; notSupplied: SupplyUploadRow[] } {
  const known = new Set(suppliedSkuCodes.map((code) => code.toLowerCase()));

  const applicable: SupplyUploadRow[] = [];
  const notSupplied: SupplyUploadRow[] = [];

  for (const row of rows) {
    if (known.has(row.skuCode.toLowerCase())) applicable.push(row);
    else notSupplied.push(row);
  }

  return { applicable, notSupplied };
}

/* ------------------------------------------------------------------ *
 * Price changes are requests, not edits
 * ------------------------------------------------------------------ */

/**
 * Fields cleared whenever a request stops being outstanding.
 *
 * Exported so the two callers cannot spell "no request" differently. A row
 * left holding a proposedAt with no proposedCostFils would sit in the approval
 * queue's count forever without ever appearing in its list.
 */
export const NO_PRICE_REQUEST = {
  proposedCostFils: null,
  proposedReason: null,
  proposedAt: null,
  proposedByName: null,
} as const;

export type PriceIntent = {
  /** What to write to the ProductSupply row. Never includes costFils. */
  data: Record<string, unknown>;
  /** The audit action, so the log distinguishes an ask from a withdrawal. */
  auditAs: string;
};

/**
 * What a submitted cost MEANS, given what is agreed and what is already asked.
 *
 * A supplier cannot set what we pay them; they can ask. This decides which of
 * four things a submitted figure is, and the reason it is a separate, pure
 * function is that only one of them raises a request — re-saving the form
 * after correcting a lead time must not put the line in somebody's queue.
 *
 * costFils never appears in the returned data. That is the guarantee: whatever
 * happens here, the agreed price is untouched, and the buying run goes on
 * paying it until an admin decides.
 *
 * `now` is passed in rather than read, so the behaviour is testable.
 */
export function priceIntent(
  agreed: number | null,
  alreadyAsked: number | null,
  requested: number | null,
  reason: string | null,
  by: string,
  now: Date
): PriceIntent {
  // What we already pay. Any outstanding request is withdrawn — they have just
  // told us the agreed price is the one they want after all.
  if (requested === agreed) {
    return alreadyAsked === null
      ? { data: {}, auditAs: "supply.update" }
      : { data: { ...NO_PRICE_REQUEST }, auditAs: "supply.price.withdraw" };
  }

  // The same figure they already asked for. Nothing new to say, though a
  // reason typed on the second attempt is still worth keeping.
  if (requested === alreadyAsked) {
    return {
      data: reason ? { proposedReason: reason } : {},
      auditAs: "supply.update",
    };
  }

  return {
    data: {
      proposedCostFils: requested,
      proposedReason: reason,
      proposedAt: now,
      proposedByName: by,
    },
    auditAs: "supply.price.request",
  };
}
