/**
 * The catalogue upload template — BE-04.
 *
 * One row is one purchasable pack: a product, the pack it is sold in, what it
 * sells for, what it costs, who supplies it, and how to picture it. Products
 * with several pack sizes get a row each, sharing a product code.
 *
 * Pure and free of any spreadsheet library, so the rules can be tested without
 * building a workbook — the same split as query.ts against catalog.ts. The
 * .xlsx is read by exceljs in catalogue-import.ts and handed here as plain
 * strings.
 *
 * The file is parsed as a workbook, never by splitting text on commas. That is
 * not a preference: splitting on commas is precisely what broke the old
 * platform's bulk upload, because a category named "Gloves, Nitrile" silently
 * shifted every column after it and nobody noticed until the prices were wrong.
 */

export type ColumnSpec = {
  key: string;
  header: string;
  required: boolean;
  /** Shown in the notes sheet, so the person filling it in knows what is meant. */
  help: string;
  example: string;
  width: number;
};

export const COLUMNS: ColumnSpec[] = [
  {
    key: "productCode",
    header: "Product code",
    required: true,
    help: "Your own code for the product. Rows sharing a product code are pack sizes of the same product.",
    example: "GLV-NIT-BLU",
    width: 16,
  },
  {
    key: "name",
    header: "Product name",
    required: true,
    help: "What a buyer sees. Include the size or variant, e.g. Medium.",
    example: "Nitrile Examination Gloves, Blue, Medium",
    width: 42,
  },
  {
    key: "brand",
    header: "Brand",
    required: false,
    help: "Leave blank if unbranded. A brand not already on the site is created.",
    example: "Ansell",
    width: 16,
  },
  {
    key: "description",
    header: "Description",
    required: false,
    help: "Shown on the product page. Plain text.",
    example: "Powder-free nitrile examination gloves, textured fingertips.",
    width: 50,
  },
  {
    key: "category",
    header: "Category",
    required: true,
    help: "Use > between levels, e.g. Medical Consumables > Gloves. Created if new.",
    example: "Medical Consumables > Gloves",
    width: 34,
  },
  {
    key: "skuCode",
    header: "Item code",
    required: true,
    help: "Unique across the whole catalogue. This is the code on your shelf label.",
    example: "GLV-NIT-BLU-M-100",
    width: 20,
  },
  {
    key: "unitLabel",
    header: "Sold as",
    required: true,
    help: "The pack a buyer adds to the basket, e.g. 100 Pieces/Box.",
    example: "100 Pieces/Box",
    width: 18,
  },
  {
    key: "unitShortLabel",
    header: "Short unit",
    required: true,
    help: "The one word beside Add to cart, e.g. Box.",
    example: "Box",
    width: 12,
  },
  {
    key: "eachesPerPack",
    header: "Units per pack",
    required: true,
    help: "How many single items are in this pack. 1 if it is sold singly.",
    example: "100",
    width: 14,
  },
  {
    key: "priceAED",
    header: "Sell price AED",
    required: true,
    help: "What the customer pays for one pack, excluding VAT.",
    example: "24.50",
    width: 14,
  },
  {
    key: "costAED",
    header: "Cost AED",
    required: false,
    help: "What you pay the primary supplier for one pack. Never shown to anyone outside the admin. Leave blank if not agreed yet.",
    example: "17.80",
    width: 12,
  },
  {
    key: "taxClass",
    header: "VAT",
    required: true,
    help: "Standard or Zero-rated. Decides what checkout charges.",
    example: "Standard",
    width: 12,
  },
  {
    key: "primarySupplier",
    header: "Primary supplier",
    required: true,
    help: "Must match a supplier already set up in the admin, exactly.",
    example: "Gulf Medical Trading",
    width: 24,
  },
  {
    key: "primaryPartNumber",
    header: "Primary supplier code",
    required: false,
    help: "What the primary supplier calls this item. Printed on their purchase order so their picker finds it.",
    example: "GMT-4417",
    width: 20,
  },
  {
    key: "backupSupplier",
    header: "Backup supplier",
    required: false,
    help: "Used automatically when the primary cannot supply. Leave blank if there is no second source.",
    example: "Emirates Medical Supplies",
    width: 24,
  },
  {
    key: "backupPartNumber",
    header: "Backup supplier code",
    required: false,
    help: "What the backup supplier calls this item.",
    example: "EMS-99120",
    width: 20,
  },
  {
    key: "backupCostAED",
    header: "Backup cost AED",
    required: false,
    help: "What the backup charges for one pack, if different.",
    example: "18.40",
    width: 16,
  },
  {
    key: "breaks",
    header: "Price breaks",
    required: false,
    help: "Quantity@price, separated by semicolons, cheaper as quantity rises. E.g. 6@23.10; 24@21.90",
    example: "6@23.10; 24@21.90",
    width: 26,
  },
  {
    key: "image",
    header: "Image file",
    required: false,
    help: "Filename in the images folder you send with this sheet, e.g. GLV-NIT-BLU-M-100.jpg.",
    example: "GLV-NIT-BLU-M-100.jpg",
    width: 26,
  },
];

export const HEADERS = COLUMNS.map((c) => c.header);

export type RawRow = Record<string, string>;

export type PriceBreak = { minQty: number; priceAED: number };

export type ParsedRow = {
  rowNumber: number;
  productCode: string;
  name: string;
  brand: string | null;
  description: string | null;
  categoryPath: string[];
  skuCode: string;
  unitLabel: string;
  unitShortLabel: string;
  eachesPerPack: number;
  priceAED: number;
  costAED: number | null;
  taxClass: "Standard" | "ZeroRated";
  primarySupplier: string;
  primaryPartNumber: string | null;
  backupSupplier: string | null;
  backupPartNumber: string | null;
  backupCostAED: number | null;
  breaks: PriceBreak[];
  image: string | null;
};

export type RowError = { rowNumber: number; column: string; message: string };

export type ParseResult = {
  rows: ParsedRow[];
  errors: RowError[];
};

const clean = (v: string | undefined) => (v ?? "").trim();
const orNull = (v: string | undefined) => {
  const s = clean(v);
  return s.length > 0 ? s : null;
};

/** Money as written by a person: "24.50", "AED 24.50", "1,240.00". */
function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/aed/i, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Two decimals is a hard rule elsewhere in the system; more here is a typo
  // rather than precision, and rounding it silently would hide the mistake.
  return Math.round(value * 100) / 100;
}

function parseWholeNumber(raw: string): number | null {
  const value = Number(raw.replace(/,/g, "").trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** "6@23.10; 24@21.90" — ascending quantity, descending price. */
export function parseBreaks(raw: string): { breaks: PriceBreak[]; error: string | null } {
  const text = clean(raw);
  if (text === "") return { breaks: [], error: null };

  const breaks: PriceBreak[] = [];
  for (const part of text.split(";")) {
    const piece = part.trim();
    if (piece === "") continue;

    const [qtyText, priceText] = piece.split("@");
    if (priceText === undefined) {
      return { breaks: [], error: `"${piece}" should be written as quantity@price, e.g. 6@23.10` };
    }
    const minQty = parseWholeNumber(qtyText ?? "");
    const priceAED = parseMoney(priceText);
    if (minQty === null) return { breaks: [], error: `"${qtyText?.trim()}" is not a whole quantity` };
    if (priceAED === null) return { breaks: [], error: `"${priceText.trim()}" is not a price` };

    breaks.push({ minQty, priceAED });
  }

  const sorted = [...breaks].sort((a, b) => a.minQty - b.minQty);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minQty === sorted[i - 1].minQty) {
      return { breaks: [], error: `quantity ${sorted[i].minQty} appears twice` };
    }
    if (sorted[i].priceAED >= sorted[i - 1].priceAED) {
      return {
        breaks: [],
        error: `buying ${sorted[i].minQty} must cost less per pack than buying ${sorted[i - 1].minQty}`,
      };
    }
  }

  return { breaks: sorted, error: null };
}

const TAX_CLASSES: Record<string, "Standard" | "ZeroRated"> = {
  standard: "Standard",
  "standard rated": "Standard",
  "5%": "Standard",
  "zero-rated": "ZeroRated",
  "zero rated": "ZeroRated",
  zerorated: "ZeroRated",
  zero: "ZeroRated",
  "0%": "ZeroRated",
};

/**
 * Validates every row and reports every problem.
 *
 * A row with a problem is reported and left out, never quietly skipped: the
 * register records under BE-04 that unknown values must be reported per row,
 * because an import that says "48 of 60 loaded" without saying which twelve is
 * worse than one that refuses outright.
 */
export function parseRows(raw: RawRow[]): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seenSkuCodes = new Map<string, number>();

  raw.forEach((row, index) => {
    // Row 1 is the header, so the first data row is row 2 — and that is the
    // number the person will see in their own spreadsheet.
    const rowNumber = index + 2;
    const problems: RowError[] = [];
    const fail = (column: string, message: string) =>
      problems.push({ rowNumber, column, message });

    for (const column of COLUMNS) {
      if (column.required && clean(row[column.header]) === "") {
        fail(column.header, "is required");
      }
    }

    const skuCode = clean(row["Item code"]);
    if (skuCode !== "") {
      const earlier = seenSkuCodes.get(skuCode.toLowerCase());
      if (earlier) fail("Item code", `"${skuCode}" is already used on row ${earlier}`);
      else seenSkuCodes.set(skuCode.toLowerCase(), rowNumber);
    }

    const eachesPerPack = parseWholeNumber(clean(row["Units per pack"]));
    if (clean(row["Units per pack"]) !== "" && eachesPerPack === null) {
      fail("Units per pack", "must be a whole number of 1 or more");
    }

    const priceAED = parseMoney(clean(row["Sell price AED"]));
    if (clean(row["Sell price AED"]) !== "" && priceAED === null) {
      fail("Sell price AED", "is not a price");
    }

    const costRaw = clean(row["Cost AED"]);
    const costAED = costRaw === "" ? null : parseMoney(costRaw);
    if (costRaw !== "" && costAED === null) fail("Cost AED", "is not a price");

    const backupCostRaw = clean(row["Backup cost AED"]);
    const backupCostAED = backupCostRaw === "" ? null : parseMoney(backupCostRaw);
    if (backupCostRaw !== "" && backupCostAED === null) {
      fail("Backup cost AED", "is not a price");
    }

    const taxRaw = clean(row["VAT"]).toLowerCase();
    const taxClass = TAX_CLASSES[taxRaw];
    if (taxRaw !== "" && !taxClass) {
      fail("VAT", `"${row["VAT"]}" should be Standard or Zero-rated`);
    }

    const { breaks, error: breaksError } = parseBreaks(clean(row["Price breaks"]));
    if (breaksError) fail("Price breaks", breaksError);

    if (priceAED !== null && breaks.some((b) => b.priceAED >= priceAED)) {
      fail("Price breaks", "every break must be cheaper than the single-pack price");
    }

    const categoryPath = clean(row["Category"])
      .split(">")
      .map((part) => part.trim())
      .filter(Boolean);
    if (clean(row["Category"]) !== "" && categoryPath.length === 0) {
      fail("Category", "is not a category path");
    }

    const primary = clean(row["Primary supplier"]);
    const backup = orNull(row["Backup supplier"]);
    if (backup && backup.toLowerCase() === primary.toLowerCase()) {
      fail("Backup supplier", "cannot be the same company as the primary supplier");
    }

    if (problems.length > 0) {
      errors.push(...problems);
      return;
    }

    rows.push({
      rowNumber,
      productCode: clean(row["Product code"]),
      name: clean(row["Product name"]),
      brand: orNull(row["Brand"]),
      description: orNull(row["Description"]),
      categoryPath,
      skuCode,
      unitLabel: clean(row["Sold as"]),
      unitShortLabel: clean(row["Short unit"]),
      eachesPerPack: eachesPerPack ?? 1,
      priceAED: priceAED ?? 0,
      costAED,
      taxClass: taxClass ?? "Standard",
      primarySupplier: primary,
      primaryPartNumber: orNull(row["Primary supplier code"]),
      backupSupplier: backup,
      backupPartNumber: orNull(row["Backup supplier code"]),
      backupCostAED,
      breaks,
      image: orNull(row["Image file"]),
    });
  });

  // A row caught by a conflict must not be imported either, or the sheet and
  // the catalogue end up disagreeing about the product it described.
  const conflicts = productLevelConflicts(rows);
  errors.push(...conflicts);
  const conflicted = new Set(conflicts.map((error) => error.rowNumber));

  return { rows: rows.filter((r) => !conflicted.has(r.rowNumber)), errors };
}

/**
 * Rows sharing a product code describe pack sizes of one product, so the
 * columns that belong to the product rather than the pack have to agree.
 *
 * VAT is the one that matters: it lives on the product, and letting the first
 * row silently win means a sheet saying Zero-rated on the carton quietly
 * charges 5% on it. Reported against the row that disagrees, naming what it
 * disagrees with, rather than guessed at.
 */
function productLevelConflicts(rows: ParsedRow[]): RowError[] {
  const errors: RowError[] = [];

  const fields: { column: string; of: (row: ParsedRow) => string }[] = [
    { column: "Product name", of: (r) => r.name },
    { column: "VAT", of: (r) => r.taxClass },
    { column: "Brand", of: (r) => r.brand ?? "" },
    { column: "Category", of: (r) => r.categoryPath.join(" > ") },
  ];

  const groups = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const key = row.productCode.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;

    for (const field of fields) {
      const expected = field.of(first);
      for (const row of rest) {
        if (field.of(row) !== expected) {
          errors.push({
            rowNumber: row.rowNumber,
            column: field.column,
            message:
              `differs from row ${first.rowNumber}, which shares product code ` +
              `"${first.productCode}". Rows of the same product must agree on ${field.column}.`,
          });
        }
      }
    }
  }

  return errors;
}
