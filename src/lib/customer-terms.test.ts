import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkAgreedPrice,
  checkDiscount,
  discountLabel,
} from "./customer-terms.ts";

describe("checkDiscount", () => {
  const bp = (raw: string) => {
    const result = checkDiscount(raw);
    assert.equal(result.ok, true, `refused ${raw}`);
    return result.ok ? result.basisPoints : -1;
  };

  it("turns a percentage into basis points", () => {
    assert.equal(bp("2.5"), 250);
    assert.equal(bp("10"), 1000);
    assert.equal(bp("0.01"), 1);
    assert.equal(bp("7.55"), 755);
  });

  it("survives the floats that would round the wrong way", () => {
    // 8.87 * 100 is 886.9999999999999 in binary floating point. A cast would
    // store 886 and quietly shave a hundredth of a percent off the deal.
    assert.equal(bp("8.87"), 887);
    assert.equal(bp("29.29"), 2929);
    assert.equal(bp("1.15"), 115);
  });

  it("reads blank and zero as no discount", () => {
    assert.equal(bp(""), 0);
    assert.equal(bp("   "), 0);
    assert.equal(bp("0"), 0);
    for (const absent of [null, undefined]) {
      const result = checkDiscount(absent);
      assert.equal(result.ok, true);
      assert.equal(result.ok && result.basisPoints, 0);
    }
  });

  it("forgives a typed percent sign", () => {
    assert.equal(bp("2.5%"), 250);
    assert.equal(bp(" 10 % "), 1000);
  });

  it("refuses finer than a basis point rather than rounding it away", () => {
    // Rounding 2.505 to 2.5 would put a figure nobody agreed on an invoice.
    const result = checkDiscount("2.505");
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /two decimal places/);
  });

  it("refuses a negative, and says what to do instead", () => {
    const result = checkDiscount("-5");
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /Leave it blank/);
  });

  it("refuses a figure that is obviously a slip", () => {
    assert.equal(checkDiscount("95").ok, false);
    assert.equal(checkDiscount("2500").ok, false);
    // But not one that is merely generous.
    assert.equal(checkDiscount("90").ok, true);
  });

  it("refuses what is not a number at all", () => {
    for (const bad of ["half", "2,5", "1e3", "2.5.1", "."]) {
      assert.equal(checkDiscount(bad).ok, false, bad);
    }
  });
});

describe("checkAgreedPrice", () => {
  const fils = (raw: string) => {
    const result = checkAgreedPrice(raw);
    assert.equal(result.ok, true, `refused ${raw}`);
    return result.ok ? result.fils : -1;
  };

  it("turns AED into fils", () => {
    assert.equal(fils("17.15"), 1715);
    assert.equal(fils("7"), 700);
    assert.equal(fils("0.05"), 5);
  });

  it("survives the floats that would round the wrong way", () => {
    // 17.15 * 100 is 1714.9999999999998 as a float.
    assert.equal(fils("17.15"), 1715);
    assert.equal(fils("121.54"), 12154);
    assert.equal(fils("8.87"), 887);
  });

  it("allows zero, which is a real arrangement", () => {
    // A free item on a tender. The pricing rules treat an agreed zero as an
    // agreement rather than as no agreement, and this is where it starts.
    assert.equal(fils("0"), 0);
    assert.equal(fils("0.00"), 0);
  });

  it("refuses blank, which is not a price", () => {
    const result = checkAgreedPrice("");
    assert.equal(result.ok, false);
    // And says how to express a free item, since that is what somebody
    // leaving it blank often means.
    assert.match(result.ok === false ? result.error : "", /0 for a free item/);
  });

  it("forgives a typed currency and thousands separators", () => {
    assert.equal(fils("AED 17.15"), 1715);
    assert.equal(fils("1,250.00"), 125000);
  });

  it("refuses fractions of a fils rather than rounding them", () => {
    assert.equal(checkAgreedPrice("17.155").ok, false);
  });

  it("refuses a negative", () => {
    assert.equal(checkAgreedPrice("-5").ok, false);
  });

  it("refuses a figure that is obviously a slip", () => {
    assert.equal(checkAgreedPrice("99999999").ok, false);
  });
});

describe("discountLabel", () => {
  it("reads back as a percentage", () => {
    assert.equal(discountLabel(250), "2.5%");
    assert.equal(discountLabel(1000), "10%");
    assert.equal(discountLabel(755), "7.55%");
    assert.equal(discountLabel(1), "0.01%");
  });

  it("says None rather than 0%", () => {
    assert.equal(discountLabel(0), "None");
  });

  it("round-trips whatever checkDiscount accepted", () => {
    for (const typed of ["2.5", "10", "7.55", "8.87", "0.01", "90"]) {
      const checked = checkDiscount(typed);
      assert.equal(checked.ok, true);
      const label = discountLabel(checked.ok ? checked.basisPoints : 0);
      assert.equal(label, `${Number(typed)}%`, typed);
    }
  });
});
