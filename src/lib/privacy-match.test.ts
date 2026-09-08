import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mentionsCode,
  namesAnyOf,
  stripAssetPaths,
  stripBrandNames,
} from "../../scripts/privacy-match.mjs";

/**
 * These are carve-outs in a privacy check, which makes them the most dangerous
 * code in the repository: each one makes the guard quieter. Half of these tests
 * assert that the false positives stay silenced; the other half assert that the
 * real leaks still fail, which is the half that matters.
 */

describe("an image filename is not an attribution", () => {
  const strip = (html: string, code: string) =>
    mentionsCode(stripAssetPaths(html), code);

  it("ignores a code that appears only in an img src", () => {
    assert.equal(strip(`<img src="/products/seed/GLPF100ZL.png">`, "GLPF100ZL"), false);
  });

  it("ignores the same path serialised into the RSC payload", () => {
    // No src= attribute to match on here, which is why the strip is by path.
    assert.equal(
      strip(`\\"image\\":\\"/products/seed/GLPF100ZL.png\\"`, "GLPF100ZL"),
      false
    );
  });

  it("still catches the code rendered as visible content", () => {
    assert.equal(strip(`<td>GLPF100ZL</td>`, "GLPF100ZL"), true);
  });

  it("still catches the code in serialised props", () => {
    assert.equal(strip(`\\"skuCode\\":\\"GLPF100ZL\\"`, "GLPF100ZL"), true);
  });

  it("leaves every other word on the page alone", () => {
    const page = "<p>Supplied by Chemist Warehouse</p>";
    assert.equal(stripAssetPaths(page), page);
  });
});

describe("a SKU code is not its own prefix", () => {
  it("does not read GLPF100ZL inside GLPF100ZL-10", () => {
    // The pack they DO supply. This was the whole of the failure.
    assert.equal(mentionsCode("<p>GLPF100ZL-10 · 10 Boxes/Carton</p>", "GLPF100ZL"), false);
  });

  it("does not read a code inside a longer one that precedes it", () => {
    assert.equal(mentionsCode("AMD-GLPF100ZL-10", "GLPF100ZL"), false);
  });

  it("catches the code standing on its own", () => {
    for (const page of [
      "<td>GLPF100ZL</td>",
      "GLPF100ZL · 100/Box",
      "code: GLPF100ZL",
      "GLPF100ZL",
    ]) {
      assert.equal(mentionsCode(page, "GLPF100ZL"), true, page);
    }
  });

  it("catches the longer code when that is the one being looked for", () => {
    assert.equal(mentionsCode("<p>GLPF100ZL-10</p>", "GLPF100ZL-10"), true);
  });

  it("does not blow up on a code containing regex characters", () => {
    assert.equal(mentionsCode("<p>A+B (x)</p>", "A+B (x)"), true);
  });
});

describe("a brand is not a disclosure of who supplies it", () => {
  const PRODUCTS = [
    "Livingstone Gauze Swabs Non-Sterile",
    "Livingstone Plastic Transfer Pipette",
  ];

  it("forgives a supplier's name inside one of our own product names", () => {
    const left = stripBrandNames(
      "<p>Livingstone Gauze Swabs Non-Sterile</p>",
      PRODUCTS
    );
    assert.ok(!left.includes("Livingstone"));
  });

  it("still fails a real attribution in the same page", () => {
    // The sentence this check exists to catch. It survives the carve-out
    // because only the product name was cut out.
    const left = stripBrandNames(
      "<p>Livingstone Gauze Swabs Non-Sterile</p><p>Supplied by Livingstone</p>",
      PRODUCTS
    );
    assert.ok(left.includes("Livingstone"));
  });

  it("cuts the longest title first, leaving no fragment behind", () => {
    // A shorter title that is a prefix of a longer one would otherwise cut the
    // middle out of the longer, leaving its tail to look like loose text.
    const left = stripBrandNames("Livingstone Gauze Swabs Non-Sterile", [
      "Livingstone Gauze",
      "Livingstone Gauze Swabs Non-Sterile",
    ]);
    assert.ok(!left.includes("Livingstone"));
    assert.ok(!left.includes("Swabs"));
  });

  it("does nothing at all when no product name carries a supplier's name", () => {
    const page = "<p>Supplied by Livingstone</p>";
    assert.equal(stripBrandNames(page, []), page);
  });
});

describe("a short name is not every page that contains those letters", () => {
  /*
   * A customer signed up as "mo". The supplier portal's HTML contains "mo" 76
   * times — "node_modules", "roboto", a hashed chunk filename — and the check
   * reported a DEC-24 breach on every single run. None of them was a customer.
   *
   * That is the worst state a guardrail can be in. A check that cries wolf
   * gets ignored, and an ignored check is not guarding anything: the run that
   * finally does name a customer looks exactly like the ninety before it.
   */
  const PORTAL =
    '<html><head><script src="/_next/static/chunks/node_modules_next.js">' +
    '</script></head><body class="roboto">Your purchase orders</body></html>';

  it("does not find a two-letter name inside node_modules", () => {
    assert.deepEqual(namesAnyOf(PORTAL, ["mo"]), []);
  });

  it("still finds that name when the page actually says it", () => {
    // The half that matters. Quieter must not mean blind.
    assert.deepEqual(namesAnyOf("<td>mo</td>", ["mo"]), ["mo"]);
    assert.deepEqual(namesAnyOf("<p>Ordered by mo Hamdani</p>", ["mo"]), ["mo"]);
  });

  it("finds a full name, a company and an order reference", () => {
    const page = "<p>Layla Haddad, Al Barsha Family Clinic, AM-2026-000004</p>";
    assert.deepEqual(
      namesAnyOf(page, ["Layla Haddad", "Al Barsha Family Clinic", "AM-2026-000004"]),
      ["Layla Haddad", "Al Barsha Family Clinic", "AM-2026-000004"]
    );
  });

  it("finds an email address, dots and all", () => {
    assert.deepEqual(
      namesAnyOf("<a>mailto:layla@albarsha.test</a>", ["layla@albarsha.test"]),
      ["layla@albarsha.test"]
    );
  });

  it("does not let a name hide behind different capitalisation", () => {
    assert.deepEqual(namesAnyOf("<p>LAYLA HADDAD</p>", ["Layla Haddad"]), [
      "Layla Haddad",
    ]);
  });

  it("treats a name inside a longer word as a fragment", () => {
    assert.deepEqual(namesAnyOf("<p>Haddadeen Trading</p>", ["Haddad"]), []);
    assert.deepEqual(namesAnyOf("<p>promotion</p>", ["mo"]), []);
  });

  it("does not treat a regex metacharacter in a name as a pattern", () => {
    // A company called "A.B" must not match "AXB", and must not throw.
    assert.deepEqual(namesAnyOf("<p>AXB Ltd</p>", ["A.B"]), []);
    assert.deepEqual(namesAnyOf("<p>A.B Ltd</p>", ["A.B"]), ["A.B"]);
  });

  it("ignores blanks rather than matching everything", () => {
    // An empty identifier matching every page would fail every run.
    assert.deepEqual(namesAnyOf("<p>anything</p>", ["", "   ", null as never]), []);
  });
});
