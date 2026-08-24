import { existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryByCode,
  countryName,
  flagSrc,
  dialCode,
  hasSubdivisions,
  joinPhone,
  matchSubdivision,
  splitPhone,
  subdivisionLabel,
  subdivisionsOf,
  addressPartsFrom,
  readAddressParts,
} from "./geo.ts";

describe("the country list", () => {
  it("puts the UAE first and keeps the rest alphabetical", () => {
    // Nearly every address entered here is Emirati. A form whose commonest
    // answer is 230 rows down gets the wrong answer.
    assert.equal(COUNTRIES[0]!.code, "AE");
    const rest = COUNTRIES.slice(1).map((c) => c.name);
    assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b)));
  });

  it("has no duplicate codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("gives every country a two-letter code, a name and a dialling code", () => {
    for (const country of COUNTRIES) {
      assert.match(country.code, /^[A-Z]{2}$/, country.name);
      assert.ok(country.name.length > 1, country.code);
      assert.match(country.dial, /^\+\d{1,4}$/, country.code);
    }
  });

  it("carries the GCC and the places goods come from", () => {
    for (const code of ["AE", "SA", "OM", "QA", "KW", "BH", "IN", "CN", "DE", "GB", "US"]) {
      assert.ok(countryByCode(code), code);
    }
  });

  it("defaults to somewhere that exists", () => {
    assert.ok(countryByCode(DEFAULT_COUNTRY));
  });

  it("looks a country up however the code is cased", () => {
    assert.equal(countryName("ae"), "United Arab Emirates");
    assert.equal(countryName(" AE "), "United Arab Emirates");
  });

  it("returns nothing rather than a guess for a code it does not hold", () => {
    // A wrong prefix on a delivery contact is a driver who cannot ring ahead.
    assert.equal(countryByCode("ZZ"), null);
    assert.equal(dialCode("ZZ"), null);
    assert.equal(dialCode(null), null);
    assert.equal(countryName(""), null);
  });

  it("knows the dialling codes that matter here", () => {
    assert.equal(dialCode("AE"), "+971");
    assert.equal(dialCode("SA"), "+966");
    assert.equal(dialCode("IN"), "+91");
    assert.equal(dialCode("GB"), "+44");
  });

  it("points at the flag file for a country", () => {
    assert.equal(flagSrc("AE"), "/flags/ae.svg");
    assert.equal(flagSrc("GB"), "/flags/gb.svg");
  });

  it("takes a lowercase or padded code, like every other lookup here", () => {
    assert.equal(flagSrc("ae"), "/flags/ae.svg");
    assert.equal(flagSrc(" au "), "/flags/au.svg");
  });

  it("gives every country in the list a flag that exists on disk", () => {
    // A broken image beside a phone number reads as a fault. This is the check
    // that scripts/build-flags.mjs was actually run after a country was added.
    for (const country of COUNTRIES) {
      const src = flagSrc(country.code);
      assert.ok(src, country.name + " (" + country.code + ") has no flag");
      assert.ok(
        existsSync(join("public", src!)),
        country.code + " has no file at " + src + " — run npm run flags:build"
      );
    }
  });

  it("returns nothing for a country it does not hold", () => {
    // The caller shows the dialling code on its own rather than a broken image.
    assert.equal(flagSrc("XX"), null);
    assert.equal(flagSrc(null), null);
    assert.equal(flagSrc(""), null);
  });
});

describe("subdivisions", () => {
  it("names the seven emirates", () => {
    const emirates = subdivisionsOf("AE");
    assert.equal(emirates.length, 7);
    assert.ok(emirates.includes("Dubai"));
    assert.ok(emirates.includes("Ras Al Khaimah"));
    assert.equal(subdivisionLabel("AE"), "Emirate");
  });

  it("calls each country's subdivision what that country calls it", () => {
    // "State" on a UAE address, or "Emirate" on a German one, is the sort of
    // detail that tells a buyer how much care went into the rest.
    assert.equal(subdivisionLabel("AE"), "Emirate");
    assert.equal(subdivisionLabel("SA"), "Region");
    assert.equal(subdivisionLabel("OM"), "Governorate");
    assert.equal(subdivisionLabel("IN"), "State");
    assert.equal(subdivisionLabel("CN"), "Province");
    assert.equal(subdivisionLabel("GB"), "County");
  });

  it("falls back to a free-text box for a country it has no list for", () => {
    assert.deepEqual(subdivisionsOf("IS"), []);
    assert.equal(hasSubdivisions("IS"), false);
    // Still labelled, so the box is never just "Region?" on an unknown place.
    assert.equal(subdivisionLabel("IS"), "State");
  });

  it("never returns a list it can be mutated through", () => {
    const first = subdivisionsOf("AE");
    first.push("Atlantis");
    assert.equal(subdivisionsOf("AE").length, 7);
  });

  it("has no duplicates or blanks in any list", () => {
    for (const country of COUNTRIES) {
      const items = subdivisionsOf(country.code);
      if (items.length === 0) continue;
      assert.equal(new Set(items).size, items.length, country.code);
      assert.ok(items.every((i) => i.trim().length > 0), country.code);
    }
  });
});

describe("matching what people already typed", () => {
  it("recognises an existing value whatever its case", () => {
    // The data already holds "dubai" and "Dubai" and neither should be lost
    // when these forms start using a dropdown.
    assert.equal(matchSubdivision("AE", "dubai"), "Dubai");
    assert.equal(matchSubdivision("AE", "  DUBAI "), "Dubai");
    assert.equal(matchSubdivision("AE", "Abu Dhabi"), "Abu Dhabi");
  });

  it("keeps a value it cannot match rather than blanking it", () => {
    // Something we cannot match is still what somebody wrote, and still gets
    // a parcel delivered.
    assert.equal(matchSubdivision("AE", "Al Barsha"), "Al Barsha");
    assert.equal(matchSubdivision("IS", "Reykjavik"), "Reykjavik");
  });

  it("treats blank as nothing", () => {
    assert.equal(matchSubdivision("AE", ""), null);
    assert.equal(matchSubdivision("AE", "   "), null);
    assert.equal(matchSubdivision("AE", null), null);
  });
});

describe("phone numbers", () => {
  it("drops the domestic leading zero when adding a country code", () => {
    // "+971 050..." is not a number anyone can ring, and it is exactly what
    // concatenating the two halves gives you.
    assert.equal(joinPhone("+971", "050 123 4567"), "+971 501234567");
    assert.equal(joinPhone("+971", "50 123 4567"), "+971 501234567");
  });

  it("leaves a number that already carries its own country code alone", () => {
    assert.equal(joinPhone("+971", "+44 20 7946 0000"), "+44 20 7946 0000");
  });

  it("gives back nothing when there is no number", () => {
    assert.equal(joinPhone("+971", ""), "");
    assert.equal(joinPhone("+971", "   "), "");
    assert.equal(joinPhone("+971", null), "");
  });

  it("keeps the number when there is no dialling code to add", () => {
    assert.equal(joinPhone(null, "050 123 4567"), "050 123 4567");
  });

  it("splits a stored number back for an edit form", () => {
    assert.deepEqual(splitPhone("+971 501234567"), {
      countryCode: "AE",
      national: "501234567",
    });
  });

  it("prefers the longer dialling code when two both match", () => {
    // +1 and +1876 both match a Jamaican number. The specific one is true.
    assert.equal(splitPhone("+18765550101").countryCode, "JM");
  });

  it("answers the same way every time for a shared dialling code", () => {
    // +1 is the whole North American plan and +7 covers two countries; the
    // number alone cannot say which. What matters is that the answer is
    // decided rather than falling out of alphabetical order — it only picks
    // which country an edit form opens on, and the stored number is unchanged.
    assert.equal(splitPhone("+12125550101").countryCode, "US");
    assert.equal(splitPhone("+79161234567").countryCode, "RU");
    assert.equal(splitPhone("+12125550101").national, "2125550101");
  });

  it("leaves a number with no country code as it found it", () => {
    assert.deepEqual(splitPhone("050 123 4567"), {
      countryCode: null,
      national: "050 123 4567",
    });
    assert.deepEqual(splitPhone(null), { countryCode: null, national: "" });
  });

  it("round-trips a number it built", () => {
    const joined = joinPhone(dialCode("SA"), "0512345678");
    const split = splitPhone(joined);
    assert.equal(split.countryCode, "SA");
    assert.equal(split.national, "512345678");
  });
});

describe("reading an address off a form", () => {
  it("keeps the code and the printable name together", () => {
    const parts = readAddressParts({
      countryCode: "AE",
      emirate: "Dubai",
      phoneNational: "050 123 4567",
    });
    assert.equal(parts.countryCode, "AE");
    assert.equal(parts.country, "United Arab Emirates");
    assert.equal(parts.emirate, "Dubai");
    assert.equal(parts.phone, "+971 501234567");
  });

  it("adds the right prefix for whichever country was chosen", () => {
    assert.equal(
      readAddressParts({ countryCode: "IN", phoneNational: "98765 43210" })
        .phone,
      "+91 9876543210"
    );
    assert.equal(
      readAddressParts({ countryCode: "GB", phoneNational: "020 7946 0000" })
        .phone,
      "+44 2079460000"
    );
  });

  it("tidies a subdivision to the way the list spells it", () => {
    assert.equal(
      readAddressParts({ countryCode: "AE", emirate: "dubai" }).emirate,
      "Dubai"
    );
  });

  it("keeps a subdivision it does not recognise", () => {
    // Somewhere we have no list for, or a district somebody prefers to name.
    assert.equal(
      readAddressParts({ countryCode: "IS", emirate: "Reykjavik" }).emirate,
      "Reykjavik"
    );
  });

  it("falls back to the default country rather than storing nonsense", () => {
    // A row whose country is "XX" or "" is invisible on every screen and wrong
    // in every report that groups by it.
    for (const bad of ["XX", "", null, undefined, "   "]) {
      const parts = readAddressParts({ countryCode: bad });
      assert.equal(parts.countryCode, "AE", String(bad));
      assert.equal(parts.country, "United Arab Emirates");
    }
  });

  it("still accepts a whole number from a caller that posts one", () => {
    // An older client or a direct API call must not break.
    const parts = readAddressParts({ countryCode: "AE", phone: "0501234567" });
    assert.equal(parts.phone, "+971 501234567");
  });

  it("prefers the split fields when both are present", () => {
    const parts = readAddressParts({
      countryCode: "AE",
      phoneNational: "555 000 111",
      phone: "+971 999999999",
    });
    assert.equal(parts.phone, "+971 555000111");
  });

  it("leaves a number alone when it already carries a country code", () => {
    const parts = readAddressParts({
      countryCode: "AE",
      phoneNational: "+44 20 7946 0000",
    });
    assert.equal(parts.phone, "+44 20 7946 0000");
  });

  it("gives an empty phone rather than a bare prefix", () => {
    // "+971" on its own is not a phone number, and it looks like one.
    assert.equal(readAddressParts({ countryCode: "AE" }).phone, "");
    assert.equal(
      readAddressParts({ countryCode: "AE", phoneNational: "  " }).phone,
      ""
    );
  });
});

describe("reading it straight off a FormData", () => {
  const form = (entries: Record<string, string>) => ({
    get: (key: string) => (key in entries ? entries[key]! : null),
  });

  it("reads the fields the shared component posts", () => {
    const parts = addressPartsFrom(
      form({ countryCode: "OM", emirate: "muscat", phoneNational: "9123 4567" })
    );
    assert.equal(parts.countryCode, "OM");
    assert.equal(parts.emirate, "Muscat");
    assert.equal(parts.phone, "+968 91234567");
  });

  it("honours a prefix, for a form carrying two addresses", () => {
    const parts = addressPartsFrom(
      form({
        countryCode: "AE",
        "billing.countryCode": "SA",
        "billing.emirate": "Riyadh",
      }),
      "billing."
    );
    assert.equal(parts.countryCode, "SA");
    assert.equal(parts.emirate, "Riyadh");
  });

  it("survives a form that posts none of them", () => {
    const parts = addressPartsFrom(form({}));
    assert.equal(parts.countryCode, "AE");
    assert.equal(parts.phone, "");
  });
});
