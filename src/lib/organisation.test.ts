import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ORG_NOTES_MAX,
  isRename,
  normaliseOrganisation,
  organisationChanges,
  validateOrganisation,
  type OrganisationInput,
} from "./organisation.ts";

const account: OrganisationInput = {
  name: "Al Wasl Medical Centre",
  trn: "100123456700003",
  phone: "+971 4 555 0100",
  countryCode: "AE",
  emirate: "Dubai",
  notes: null,
  isDisabled: false,
};

describe("normaliseOrganisation", () => {
  it("collapses the spacing a person types", () => {
    const out = normaliseOrganisation({ ...account, name: "  Al Wasl   Medical  " });
    assert.equal(out.name, "Al Wasl Medical");
  });

  it("stores a TRN as fifteen digits however it was entered", () => {
    // Two records of one number must not look like two numbers.
    assert.equal(
      normaliseOrganisation({ ...account, trn: "100 1234 5670 0003" }).trn,
      "100123456700003"
    );
  });

  it("treats an empty field as absent, not as an empty string", () => {
    const out = normaliseOrganisation({
      ...account,
      phone: "   ",
      emirate: "",
      notes: "  ",
    });
    assert.equal(out.phone, null);
    assert.equal(out.emirate, null);
    assert.equal(out.notes, null);
  });

  it("accepts a country code in any case", () => {
    assert.equal(normaliseOrganisation({ ...account, countryCode: "ae" }).countryCode, "AE");
  });
});

describe("validateOrganisation", () => {
  it("accepts a complete account", () => {
    assert.equal(validateOrganisation(account), null);
  });

  it("accepts one with no TRN, because plenty of buyers are not registered", () => {
    assert.equal(validateOrganisation({ ...account, trn: null }), null);
    assert.equal(validateOrganisation({ ...account, trn: "  " }), null);
  });

  it("refuses a name that is not one", () => {
    assert.equal(validateOrganisation({ ...account, name: " " })?.field, "name");
    assert.equal(validateOrganisation({ ...account, name: "A" })?.field, "name");
  });

  it("refuses a TRN that is not fifteen digits", () => {
    for (const trn of ["12345", "10012345670000A", "1001234567000031"]) {
      assert.equal(validateOrganisation({ ...account, trn })?.field, "trn", trn);
    }
  });

  it("refuses the placeholder range, so a test number cannot pass as real", () => {
    // The whole point of the 9999 prefix: it must never reach a tax invoice
    // looking like a registration.
    assert.equal(validateOrganisation({ ...account, trn: "999900000000002" })?.field, "trn");
  });

  it("refuses an unknown country", () => {
    assert.equal(validateOrganisation({ ...account, countryCode: "ZZ" })?.field, "countryCode");
    assert.equal(validateOrganisation({ ...account, countryCode: "" })?.field, "countryCode");
  });

  it("refuses a region the country does not have", () => {
    // An invoice addressed to an emirate that does not exist is a document
    // somebody has to explain.
    assert.equal(validateOrganisation({ ...account, emirate: "Atlantis" })?.field, "emirate");
  });

  it("accepts a blank region", () => {
    assert.equal(validateOrganisation({ ...account, emirate: null }), null);
  });

  it("refuses notes longer than the column is meant to hold", () => {
    const long = "x".repeat(ORG_NOTES_MAX + 1);
    assert.equal(validateOrganisation({ ...account, notes: long })?.field, "notes");
    assert.equal(validateOrganisation({ ...account, notes: "x".repeat(ORG_NOTES_MAX) }), null);
  });
});

describe("organisationChanges", () => {
  it("says nothing when nothing changed", () => {
    assert.deepEqual(organisationChanges(account, { ...account }), []);
  });

  it("ignores a difference that is only spacing", () => {
    assert.deepEqual(
      organisationChanges(account, { ...account, name: "Al Wasl  Medical Centre " }),
      []
    );
    assert.deepEqual(organisationChanges(account, { ...account, trn: "100 123 456 700 003" }), []);
  });

  it("names the old and new value for what appears on a document", () => {
    const [change] = organisationChanges(account, { ...account, name: "Al Wasl Clinic" });
    assert.match(change, /Al Wasl Medical Centre/);
    assert.match(change, /Al Wasl Clinic/);
  });

  it("does not print a note into the audit trail", () => {
    const [change] = organisationChanges(account, { ...account, notes: "Deliver before 11am" });
    assert.equal(change, "notes updated");
  });

  it("distinguishes setting a value from clearing it", () => {
    assert.deepEqual(organisationChanges(account, { ...account, trn: null }), ["TRN removed"]);
    assert.deepEqual(organisationChanges({ ...account, trn: null }, account), [
      `TRN set to ${account.trn}`,
    ]);
  });

  it("reports disabling and re-enabling in the words an operator would use", () => {
    assert.deepEqual(organisationChanges(account, { ...account, isDisabled: true }), [
      "account disabled",
    ]);
    assert.deepEqual(organisationChanges({ ...account, isDisabled: true }, account), [
      "account re-enabled",
    ]);
  });

  it("lists every change, not the first", () => {
    const changes = organisationChanges(account, {
      ...account,
      name: "Al Wasl Clinic",
      emirate: "Sharjah",
      isDisabled: true,
    });
    assert.equal(changes.length, 3);
  });
});

describe("isRename", () => {
  it("is true only when the name a customer sees actually moved", () => {
    assert.equal(isRename(account, { ...account, name: "Al Wasl Clinic" }), true);
    assert.equal(isRename(account, { ...account, name: "  Al Wasl Medical Centre" }), false);
    assert.equal(isRename(account, { ...account, phone: "+971 4 555 0199" }), false);
  });
});
