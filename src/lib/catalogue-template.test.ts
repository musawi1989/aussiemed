import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLUMNS, parseBreaks, parseRows, type RawRow } from "./catalogue-template.ts";

/** A row that passes, so each test can break exactly one thing. */
function good(overrides: RawRow = {}): RawRow {
  const base: RawRow = {
    "Product code": "GLV-NIT-BLU",
    "Product name": "Nitrile Gloves, Blue, Medium",
    Brand: "Ansell",
    Description: "Powder-free.",
    Category: "Medical Consumables > Gloves",
    "Item code": "GLV-NIT-BLU-M-100",
    "Sold as": "100 Pieces/Box",
    "Short unit": "Box",
    "Units per pack": "100",
    "Sell price AED": "24.50",
    "Cost AED": "17.80",
    VAT: "Standard",
    "Primary supplier": "Gulf Medical Trading",
    "Primary supplier code": "GMT-4417",
    "Backup supplier": "Emirates Medical Supplies",
    "Backup supplier code": "EMS-99120",
    "Backup cost AED": "18.40",
    "Price breaks": "6@23.10; 24@21.90",
    "Image file": "gloves.jpg",
  };
  return { ...base, ...overrides };
}

describe("the template itself", () => {
  it("has a unique header for every column", () => {
    const headers = COLUMNS.map((c) => c.header);
    assert.equal(new Set(headers).size, headers.length);
  });

  it("gives every column an example and an explanation", () => {
    for (const column of COLUMNS) {
      assert.ok(column.help.length > 10, `${column.header} has no help`);
      assert.ok(column.example.length > 0, `${column.header} has no example`);
    }
  });
});

describe("reading a good row", () => {
  it("accepts it and keeps every field", () => {
    const { rows, errors } = parseRows([good()]);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);

    const row = rows[0];
    assert.equal(row.skuCode, "GLV-NIT-BLU-M-100");
    assert.equal(row.priceAED, 24.5);
    assert.equal(row.costAED, 17.8);
    assert.equal(row.eachesPerPack, 100);
    assert.equal(row.taxClass, "Standard");
    assert.deepEqual(row.categoryPath, ["Medical Consumables", "Gloves"]);
    assert.equal(row.backupSupplier, "Emirates Medical Supplies");
    assert.equal(row.image, "gloves.jpg");
  });

  it("numbers rows as the spreadsheet does, counting the header", () => {
    const { rows } = parseRows([good(), good({ "Item code": "SECOND" })]);
    assert.deepEqual(rows.map((r) => r.rowNumber), [2, 3]);
  });

  it("accepts money written the way people write it", () => {
    const { rows, errors } = parseRows([
      good({ "Sell price AED": "AED 1,240.00", "Cost AED": " 900 " }),
    ]);
    assert.deepEqual(errors, []);
    assert.equal(rows[0].priceAED, 1240);
    assert.equal(rows[0].costAED, 900);
  });

  it("treats a blank cost as not recorded rather than free", () => {
    const { rows } = parseRows([good({ "Cost AED": "" })]);
    assert.equal(rows[0].costAED, null);
  });

  it("accepts the ways people write the VAT class", () => {
    for (const [written, expected] of [
      ["Standard", "Standard"],
      ["standard rated", "Standard"],
      ["Zero-rated", "ZeroRated"],
      ["ZERO RATED", "ZeroRated"],
      ["0%", "ZeroRated"],
    ] as const) {
      const { rows, errors } = parseRows([good({ VAT: written })]);
      assert.deepEqual(errors, [], `${written} was rejected`);
      assert.equal(rows[0].taxClass, expected);
    }
  });
});

describe("reporting what is wrong", () => {
  it("names the missing column rather than failing vaguely", () => {
    const { rows, errors } = parseRows([good({ "Sell price AED": "" })]);
    assert.equal(rows.length, 0);
    assert.equal(errors[0].column, "Sell price AED");
    assert.match(errors[0].message, /required/);
    assert.equal(errors[0].rowNumber, 2);
  });

  /** The register's own requirement: report per row, never skip silently. */
  it("reports a bad row and still reads the good ones", () => {
    const { rows, errors } = parseRows([
      good({ "Item code": "FIRST" }),
      good({ "Item code": "SECOND", VAT: "sometimes" }),
      good({ "Item code": "THIRD" }),
    ]);
    assert.deepEqual(rows.map((r) => r.skuCode), ["FIRST", "THIRD"]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].rowNumber, 3);
  });

  it("reports every problem on a row, not just the first", () => {
    const { errors } = parseRows([
      good({ "Sell price AED": "", "Units per pack": "", VAT: "" }),
    ]);
    assert.ok(errors.length >= 3, `only reported ${errors.length}`);
  });

  it("catches a repeated item code, naming the earlier row", () => {
    const { rows, errors } = parseRows([good(), good({ "Product name": "Another" })]);
    assert.equal(rows.length, 1);
    assert.match(errors[0].message, /already used on row 2/);
  });

  it("refuses a backup that is the same company as the primary", () => {
    const { errors } = parseRows([
      good({ "Backup supplier": "Gulf Medical Trading" }),
    ]);
    assert.equal(errors[0].column, "Backup supplier");
  });

  it("refuses a fractional pack quantity", () => {
    const { errors } = parseRows([good({ "Units per pack": "2.5" })]);
    assert.equal(errors[0].column, "Units per pack");
  });
});

/**
 * Rows sharing a product code are pack sizes of one product, and VAT lives on
 * the product. A sheet saying Zero-rated on the carton and Standard on the box
 * used to let the first row win silently, which charged 5% on a line the sheet
 * said was zero-rated.
 */
describe("rows of the same product", () => {
  it("accepts pack sizes that agree", () => {
    const { rows, errors } = parseRows([
      good({ "Item code": "BOX", "Sold as": "100 Pieces/Box" }),
      good({ "Item code": "CARTON", "Sold as": "1000 Pieces/Carton", "Units per pack": "1000", "Sell price AED": "228.00", "Price breaks": "" }),
    ]);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 2);
  });

  it("refuses two pack sizes that disagree on VAT", () => {
    const { rows, errors } = parseRows([
      good({ "Item code": "BOX", VAT: "Standard" }),
      good({ "Item code": "CARTON", VAT: "Zero-rated", "Price breaks": "" }),
    ]);

    const conflict = errors.find((e) => e.column === "VAT");
    assert.ok(conflict, "no VAT conflict reported");
    assert.equal(conflict.rowNumber, 3);
    assert.match(conflict.message, /differs from row 2/);
    // The offending row is kept out, so the catalogue cannot disagree with the sheet.
    assert.deepEqual(rows.map((r) => r.skuCode), ["BOX"]);
  });

  it("refuses a product name that disagrees between pack sizes", () => {
    const { errors } = parseRows([
      good({ "Item code": "BOX" }),
      good({ "Item code": "CARTON", "Product name": "Something else", "Price breaks": "" }),
    ]);
    assert.ok(errors.some((e) => e.column === "Product name"));
  });

  it("leaves different product codes alone", () => {
    const { errors } = parseRows([
      good({ "Product code": "ONE", "Item code": "A", VAT: "Standard" }),
      good({ "Product code": "TWO", "Item code": "B", VAT: "Zero-rated", "Price breaks": "" }),
    ]);
    assert.deepEqual(errors, []);
  });
});

describe("price breaks", () => {
  it("reads them and sorts them", () => {
    const { breaks, error } = parseBreaks("24@21.90; 6@23.10");
    assert.equal(error, null);
    assert.deepEqual(breaks, [
      { minQty: 6, priceAED: 23.1 },
      { minQty: 24, priceAED: 21.9 },
    ]);
  });

  it("accepts none", () => {
    assert.deepEqual(parseBreaks(""), { breaks: [], error: null });
  });

  /** The rule the database already enforces, caught before the import runs. */
  it("refuses a break that costs more for buying more", () => {
    const { error } = parseBreaks("6@23.10; 24@25.00");
    assert.match(error ?? "", /must cost less/);
  });

  it("refuses the same quantity twice", () => {
    const { error } = parseBreaks("6@23.10; 6@22.00");
    assert.match(error ?? "", /twice/);
  });

  it("explains the format when it is written wrongly", () => {
    assert.match(parseBreaks("6 for 23.10").error ?? "", /quantity@price/);
  });

  it("refuses a break at or above the single-pack price", () => {
    const { errors } = parseRows([
      good({ "Sell price AED": "24.50", "Price breaks": "6@24.50" }),
    ]);
    assert.equal(errors[0].column, "Price breaks");
    assert.match(errors[0].message, /cheaper than the single-pack price/);
  });
});

/**
 * The defect this whole format exists to avoid: the old platform split rows on
 * commas, so a category containing one shifted every column after it.
 */
describe("commas in values", () => {
  it("keeps a comma inside a category name", () => {
    const { rows, errors } = parseRows([
      good({ Category: "Medical Consumables > Gloves, Nitrile" }),
    ]);
    assert.deepEqual(errors, []);
    assert.deepEqual(rows[0].categoryPath, ["Medical Consumables", "Gloves, Nitrile"]);
  });

  it("keeps commas in a product name without shifting anything", () => {
    const { rows, errors } = parseRows([
      good({ "Product name": "Gloves, Nitrile, Blue, Medium" }),
    ]);
    assert.deepEqual(errors, []);
    assert.equal(rows[0].name, "Gloves, Nitrile, Blue, Medium");
    assert.equal(rows[0].priceAED, 24.5);
    assert.equal(rows[0].primarySupplier, "Gulf Medical Trading");
  });
});
