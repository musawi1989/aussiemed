import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  categoryPath,
  deepestCategory,
  groupByCategory,
  RETIRED,
  UNFILED,
  type CategoryNode,
} from "./supply-grouping.ts";

const dental: CategoryNode = { id: "d", name: "Dental" };
const endo: CategoryNode = { id: "e", name: "Endodontics", parent: dental };
const files: CategoryNode = { id: "f", name: "Hand Files", parent: endo };
const medical: CategoryNode = { id: "m", name: "Medical Consumables" };
const gloves: CategoryNode = { id: "g", name: "Gloves", parent: medical };

const item = (name: string, category: CategoryNode | null) => ({ name, category });

describe("categoryPath", () => {
  it("reads root first", () => {
    assert.deepEqual(categoryPath(files), ["Dental", "Endodontics", "Hand Files"]);
  });

  it("is a single name for a department", () => {
    assert.deepEqual(categoryPath(dental), ["Dental"]);
  });

  it("is empty for nothing", () => {
    assert.deepEqual(categoryPath(null), []);
    assert.deepEqual(categoryPath(undefined), []);
  });

  it("stops rather than hanging on a cycle", () => {
    const a: CategoryNode = { id: "a", name: "A" };
    const b: CategoryNode = { id: "b", name: "B", parent: a };
    a.parent = b; // a broken tree, but not one that should freeze a page
    assert.ok(categoryPath(b).length <= 8);
  });
});

describe("deepestCategory", () => {
  it("prefers the shelf over the department it sits in", () => {
    assert.equal(deepestCategory([dental, files])?.name, "Hand Files");
    // Order must not matter — the whole point of not trusting relation order.
    assert.equal(deepestCategory([files, dental])?.name, "Hand Files");
  });

  it("ignores blanks", () => {
    assert.equal(deepestCategory([null, gloves, undefined])?.name, "Gloves");
  });

  it("is null when there is nothing to choose from", () => {
    assert.equal(deepestCategory([]), null);
    assert.equal(deepestCategory([null, undefined]), null);
  });
});

describe("groupByCategory", () => {
  const groups = (items: ReturnType<typeof item>[]) =>
    groupByCategory(items, (i) => i.category);

  it("splits by department and sub-category", () => {
    const result = groups([
      item("K-file", files),
      item("Nitrile box", gloves),
      item("Paper points", endo),
    ]);
    assert.deepEqual(
      result.map((g) => [g.department, g.subCategory, g.items.length]),
      [
        ["Dental", "Endodontics", 2],
        ["Medical Consumables", "Gloves", 1],
      ]
    );
  });

  it("collapses a third level onto its sub-category", () => {
    // Hand Files sits under Endodontics; both file under the same heading, or
    // the grouping reproduces the wall it exists to replace.
    const result = groups([item("K-file", files), item("Gutta percha", endo)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].subCategory, "Endodontics");
  });

  it("keeps an item that sits on the department itself", () => {
    const result = groups([item("Loose item", dental), item("K-file", files)]);
    assert.deepEqual(
      result.map((g) => g.subCategory),
      // The general case first, then the shelf that refines it.
      [null, "Endodontics"]
    );
  });

  it("shows uncategorised items rather than dropping them", () => {
    const result = groups([item("Orphan", null), item("Nitrile box", gloves)]);
    assert.equal(
      result.flatMap((g) => g.items).length,
      2,
      "every item must survive grouping, or the heading count lies"
    );
    // And last, because it is the group somebody needs to act on.
    assert.equal(result.at(-1)?.department, "Uncategorised");
  });

  it("sorts departments alphabetically, with uncategorised last", () => {
    const zed: CategoryNode = { id: "z", name: "Zinc Products" };
    const result = groups([
      item("Orphan", null),
      item("Zinc", zed),
      item("Nitrile", gloves),
    ]);
    assert.deepEqual(
      result.map((g) => g.department),
      ["Medical Consumables", "Zinc Products", "Uncategorised"]
    );
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(groups([]), []);
  });
});

describe("the two answer-groups", () => {
  const groups = (items: ReturnType<typeof item>[]) =>
    groupByCategory(items, (i) => i.category);

  it("sinks both below every real department", () => {
    const result = groups([
      item("Orphan", null),
      item("Discontinued", { id: "r", name: RETIRED }),
      item("Nitrile", gloves),
      item("Aardvark brand", { id: "a", name: "Aardvark Supplies" }),
    ]);
    assert.deepEqual(result.map((g) => g.department), [
      "Aardvark Supplies",
      "Medical Consumables",
      UNFILED,
      RETIRED,
    ]);
  });

  it("puts retired last of all, since it is the least urgent of the two", () => {
    // Uncategorised may be a fault worth fixing. Retired is simply history.
    const result = groups([
      item("Discontinued", { id: "r", name: RETIRED }),
      item("Orphan", null),
    ]);
    assert.deepEqual(result.map((g) => g.department), [UNFILED, RETIRED]);
  });
});
