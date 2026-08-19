import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUSINESS_TYPES,
  businessTypeByCode,
  departmentsFor,
} from "./business-types.ts";

/** Every department the storefront actually has, as of 19 Aug 2026. */
const DEPARTMENTS = new Set([
  "medical-consumables",
  "wound-care-first-aid-and-safety",
  "kitchen",
  "laboratory",
  "protective-wear-ppe",
  "beauty-skin-and-personal-care",
  "instruments-and-diagnostics",
  "cleaning-and-hygiene",
  "office-and-stationery-supplies",
  "pet-care",
  "tattoo-and-piercing",
  "surgical-and-theatre",
  "nursing-and-patient-care",
  "dental",
]);

describe("the list itself", () => {
  it("carries every trade the client gave, and no duplicates", () => {
    assert.equal(BUSINESS_TYPES.length, 18);
    assert.equal(new Set(BUSINESS_TYPES.map((t) => t.code)).size, 18);
    assert.equal(new Set(BUSINESS_TYPES.map((t) => t.label)).size, 18);
  });

  it("keeps the client's codes exactly, because they travel in the URL", () => {
    const codes = BUSINESS_TYPES.map((t) => t.code);
    for (const code of ["BT-MED", "BT-DEN", "BT-VET", "BT-AES", "BT-GEN", "BT-HOS"]) {
      assert.ok(codes.includes(code), code);
    }
    assert.ok(codes.every((code) => /^BT-[A-Z]{3}$/.test(code)));
  });

  it("only ever points at departments that exist", () => {
    // A slug that has been renamed would filter to nothing, silently, and look
    // like a trade that buys nothing from us.
    for (const type of BUSINESS_TYPES) {
      for (const slug of type.departments) {
        assert.ok(DEPARTMENTS.has(slug), `${type.code} -> ${slug}`);
      }
    }
  });

  it("never lists the same department twice for one trade", () => {
    for (const type of BUSINESS_TYPES) {
      assert.equal(
        new Set(type.departments).size,
        type.departments.length,
        type.code
      );
    }
  });
});

describe("businessTypeByCode", () => {
  it("finds a trade however the code was typed", () => {
    assert.equal(businessTypeByCode("BT-DEN")?.label, "Dental Clinic");
    assert.equal(businessTypeByCode("bt-den")?.label, "Dental Clinic");
    assert.equal(businessTypeByCode(" BT-DEN ")?.label, "Dental Clinic");
  });

  it("returns nothing for a code that is not ours", () => {
    assert.equal(businessTypeByCode("BT-XXX"), undefined);
    assert.equal(businessTypeByCode(""), undefined);
    assert.equal(businessTypeByCode(undefined), undefined);
  });
});

describe("departmentsFor", () => {
  it("narrows a dental clinic to what a dental clinic buys", () => {
    assert.deepEqual(departmentsFor("BT-DEN"), [
      "dental",
      "protective-wear-ppe",
      "cleaning-and-hygiene",
    ]);
  });

  it("does not narrow the trades that buy everything", () => {
    // Undefined means "do not filter". An empty array would mean "match
    // nothing", and confusing the two empties the catalogue.
    assert.equal(departmentsFor("BT-GEN"), undefined);
    assert.equal(departmentsFor("BT-HOS"), undefined);
  });

  it("does not narrow on a code nobody recognises", () => {
    assert.equal(departmentsFor("BT-XXX"), undefined);
    assert.equal(departmentsFor(undefined), undefined);
  });

  it("gives a vet the animal shelf as well as the clinical ones", () => {
    const vet = departmentsFor("BT-VET") ?? [];
    assert.ok(vet.includes("pet-care"));
    assert.ok(vet.includes("medical-consumables"));
  });

  it("keeps a café out of the clinical half of the catalogue", () => {
    const cafe = departmentsFor("BT-FNB") ?? [];
    assert.ok(cafe.includes("kitchen"));
    assert.ok(!cafe.includes("dental"));
    assert.ok(!cafe.includes("medical-consumables"));
  });
});
