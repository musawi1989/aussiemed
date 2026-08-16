import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_COST_FILS,
  MAX_LEAD_TIME_DAYS,
  MAX_PART_NUMBER,
  checkSupplyTerms,
  parseAvailability,
  parseCostToFils,
  parseLeadTime,
  parseSupplyRows,
  splitByKnownSkus,
} from "./supply-terms.ts";

/** The fils, or a failure — so an assertion reads as one value. */
const filsOf = (value: string | number | null | undefined) => {
  const result = parseCostToFils(value);
  return result.ok ? result.fils : `refused: ${result.error}`;
};

describe("parseCostToFils", () => {
  it("reads what a person types", () => {
    assert.deepEqual(parseCostToFils("12.34"), { ok: true, fils: 1_234 });
    assert.deepEqual(parseCostToFils("12"), { ok: true, fils: 1_200 });
    assert.deepEqual(parseCostToFils("12.3"), { ok: true, fils: 1_230 });
    assert.deepEqual(parseCostToFils("AED 12.34"), { ok: true, fils: 1_234 });
    assert.deepEqual(parseCostToFils("1,234.50"), { ok: true, fils: 123_450 });
    assert.deepEqual(parseCostToFils(12.34), { ok: true, fils: 1_234 });
  });

  it("does not drift, because it never multiplies a float", () => {
    // 12.34 * 100 is 1233.9999999999998 in binary floating point.
    assert.equal(filsOf("12.34"), 1_234);
    assert.equal(filsOf("0.07"), 7);
    assert.equal(filsOf("119.99"), 11_999);
  });

  it("treats blank as not recorded rather than as free", () => {
    for (const blank of ["", "   ", null, undefined]) {
      assert.deepEqual(parseCostToFils(blank), { ok: true, fils: null });
    }
  });

  it("refuses a zero cost, which is never what was meant", () => {
    assert.equal(parseCostToFils("0").ok, false);
    assert.equal(parseCostToFils("0.00").ok, false);
  });

  it("refuses what is not a price, rather than guessing", () => {
    for (const bad of ["twelve", "12.345", "-5", "1.2.3", "12 34"]) {
      assert.equal(parseCostToFils(bad).ok, false, bad);
    }
  });

  it("refuses an ambiguous comma instead of reading it as thousands", () => {
    // "12,34" is a decimal comma in half the world. Stripping it blindly
    // turns AED 12.34 into AED 1,234.00 — a hundredfold error on a cost,
    // arriving quietly through a spreadsheet.
    for (const ambiguous of ["12,34", "0,5", "1,23", "1234,56"]) {
      const result = parseCostToFils(ambiguous);
      assert.equal(result.ok, false, ambiguous);
      assert.match(result.ok === false ? result.error : "", /ambiguous/i);
    }
  });

  it("still accepts a comma that can only be a thousands separator", () => {
    // "12,345" has one reading: a decimal comma there would give three
    // decimal places, which is not a price either way.
    assert.equal(filsOf("1,234"), 123_400);
    assert.equal(filsOf("12,345"), 1_234_500);
    assert.equal(filsOf("99,999.99"), 9_999_999);
  });

  it("catches a misplaced decimal point", () => {
    const result = parseCostToFils(String(MAX_COST_FILS / 100 + 1));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /decimal point/i);
  });

  it("quotes back what was typed so the bad cell can be found", () => {
    const result = parseCostToFils("twelve");
    assert.match(result.ok === false ? result.error : "", /"twelve"/);
  });
});

describe("parseLeadTime", () => {
  it("reads whole days and treats blank as none", () => {
    assert.deepEqual(parseLeadTime("3"), { ok: true, days: 3 });
    assert.deepEqual(parseLeadTime(0), { ok: true, days: 0 });
    assert.deepEqual(parseLeadTime(""), { ok: true, days: null });
  });

  it("refuses fractions, words and anything past a year", () => {
    assert.equal(parseLeadTime("2.5").ok, false);
    assert.equal(parseLeadTime("three").ok, false);
    assert.equal(parseLeadTime(String(MAX_LEAD_TIME_DAYS + 1)).ok, false);
    assert.equal(parseLeadTime(String(MAX_LEAD_TIME_DAYS)).ok, true);
  });
});

describe("parseAvailability", () => {
  it("reads the spellings a person actually writes", () => {
    for (const yes of ["yes", "Y", "TRUE", "1", "in stock", " Available "]) {
      assert.deepEqual(parseAvailability(yes), { ok: true, available: true }, String(yes));
    }
    for (const no of ["no", "N", "false", "0", "out of stock", "Unavailable"]) {
      assert.deepEqual(parseAvailability(no), { ok: true, available: false }, String(no));
    }
  });

  it("treats blank as no change, not as available", () => {
    // A supplier leaving the column empty must not silently mark everything
    // back in stock.
    assert.deepEqual(parseAvailability(""), { ok: true, available: null });
    assert.deepEqual(parseAvailability(null), { ok: true, available: null });
  });

  it("refuses a maybe", () => {
    assert.equal(parseAvailability("sometimes").ok, false);
  });
});

describe("checkSupplyTerms", () => {
  it("accepts a complete set", () => {
    const result = checkSupplyTerms({
      supplierPartNumber: "  LIV-88231 ",
      costAED: "12.34",
      leadTimeDays: "3",
      isAvailable: true,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.terms, {
      supplierPartNumber: "LIV-88231",
      costFils: 1_234,
      leadTimeDays: 3,
      isAvailable: true,
    });
  });

  it("lets everything optional be cleared", () => {
    const result = checkSupplyTerms({
      supplierPartNumber: "",
      costAED: "",
      leadTimeDays: "",
      isAvailable: false,
    });
    assert.deepEqual(result.ok && result.terms, {
      supplierPartNumber: null,
      costFils: null,
      leadTimeDays: null,
      isAvailable: false,
    });
  });

  it("refuses an absurd part number", () => {
    const result = checkSupplyTerms({
      supplierPartNumber: "x".repeat(MAX_PART_NUMBER + 1),
    });
    assert.equal(result.ok, false);
  });

  it("passes the reason for a bad cost straight through", () => {
    const result = checkSupplyTerms({ costAED: "twelve" });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /not a price/);
  });
});

describe("parseSupplyRows", () => {
  it("reads a good file", () => {
    const { rows, problems } = parseSupplyRows([
      ["GLV-NIT-L", "LIV-88231", "12.34", "3", "yes"],
      ["SYR-3ML", "LIV-4410", "2.50", "5", "no"],
    ]);
    assert.equal(problems.length, 0);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], {
      rowNumber: 2,
      skuCode: "GLV-NIT-L",
      supplierPartNumber: "LIV-88231",
      costFils: 1_234,
      leadTimeDays: 3,
      isAvailable: true,
    });
    assert.equal(rows[1].isAvailable, false);
  });

  it("numbers rows the way the spreadsheet does, so an error can be found", () => {
    const { problems } = parseSupplyRows([
      ["GLV-NIT-L", "", "12.34", "", ""],
      ["SYR-3ML", "", "rubbish", "", ""],
    ]);
    // Header is row 1, so the second data row is row 3.
    assert.equal(problems[0].rowNumber, 3);
    assert.equal(problems[0].column, "Your price (AED)");
  });

  it("reports every problem rather than stopping at the first", () => {
    // Fixing a fifty-line file one error per upload is how a bulk tool ends
    // up unused.
    const { problems } = parseSupplyRows([
      ["A", "", "rubbish", "", ""],
      ["B", "", "", "many", ""],
      ["C", "", "", "", "maybe"],
    ]);
    assert.equal(problems.length, 3);
    assert.deepEqual(
      problems.map((p) => p.rowNumber),
      [2, 3, 4]
    );
  });

  it("ignores blank padding rows", () => {
    const { rows, problems } = parseSupplyRows([
      ["GLV-NIT-L", "", "12.34", "", ""],
      ["", "", "", "", ""],
      [null, undefined, "", null, ""],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(problems.length, 0);
  });

  it("insists on the item code, which is the only thing identifying the pack", () => {
    const { problems } = parseSupplyRows([["", "LIV-1", "12.34", "", ""]]);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /item code/i);
  });

  it("refuses two rows for one pack rather than letting the last one win", () => {
    const { rows, problems } = parseSupplyRows([
      ["GLV-NIT-L", "", "12.34", "", ""],
      ["glv-nit-l", "", "99.99", "", ""],
    ]);
    assert.equal(rows.length, 1);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /already on row 2/);
  });

  it("keeps a blank availability as no change", () => {
    const { rows } = parseSupplyRows([["GLV-NIT-L", "", "12.34", "", ""]]);
    assert.equal(rows[0].isAvailable, null);
  });
});

describe("splitByKnownSkus", () => {
  const rows = parseSupplyRows([
    ["GLV-NIT-L", "", "12.34", "", ""],
    ["NOT-OURS", "", "9.99", "", ""],
  ]).rows;

  it("keeps only the packs this supplier is actually set up for", () => {
    // A supplier cannot appoint themselves to a product — quietly, in bulk,
    // and to a competitor's line. That pairing is an admin decision.
    const { applicable, notSupplied } = splitByKnownSkus(rows, ["GLV-NIT-L"]);
    assert.equal(applicable.length, 1);
    assert.equal(applicable[0].skuCode, "GLV-NIT-L");
    assert.equal(notSupplied.length, 1);
    assert.equal(notSupplied[0].skuCode, "NOT-OURS");
  });

  it("matches item codes without caring about case", () => {
    const { applicable } = splitByKnownSkus(rows, ["glv-nit-l"]);
    assert.equal(applicable.length, 1);
  });

  it("applies nothing when the supplier supplies nothing", () => {
    const { applicable, notSupplied } = splitByKnownSkus(rows, []);
    assert.equal(applicable.length, 0);
    assert.equal(notSupplied.length, 2);
  });
});
