import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  branchIds,
  buildCategoryTree,
  filterCategoryTree,
  flattenCategoryTree,
  type CategoryRow,
} from "./category-tree.ts";

const ROWS: CategoryRow[] = [
  { id: "dental", name: "Dental", parentId: null },
  { id: "anaes", name: "Anaesthetic", parentId: "dental" },
  { id: "needles", name: "Dental Needles", parentId: "anaes" },
  { id: "topical", name: "Topical Anaesthetic", parentId: "anaes" },
  { id: "ppe", name: "Protective Wear PPE", parentId: null },
  { id: "gloves", name: "Gloves", parentId: "ppe" },
];

describe("building the tree", () => {
  it("keeps every level, not just two", () => {
    // The bug this replaces: departments and their direct children were built
    // and the third level was silently absent — 263 of 446 categories.
    const flat = flattenCategoryTree(buildCategoryTree(ROWS));
    assert.equal(flat.length, ROWS.length);
    assert.ok(flat.some((n) => n.id === "needles"));
  });

  it("records depth so the picker can indent", () => {
    const byId = new Map(
      flattenCategoryTree(buildCategoryTree(ROWS)).map((n) => [n.id, n])
    );
    assert.equal(byId.get("dental")?.depth, 0);
    assert.equal(byId.get("anaes")?.depth, 1);
    assert.equal(byId.get("needles")?.depth, 2);
  });

  it("gives every node its full path", () => {
    const byId = new Map(
      flattenCategoryTree(buildCategoryTree(ROWS)).map((n) => [n.id, n])
    );
    assert.equal(byId.get("needles")?.path, "Dental › Anaesthetic › Dental Needles");
    assert.equal(byId.get("dental")?.path, "Dental");
  });

  it("keeps the order the rows arrived in", () => {
    const roots = buildCategoryTree(ROWS).map((n) => n.id);
    assert.deepEqual(roots, ["dental", "ppe"]);
  });

  it("treats an orphan as a root rather than losing it", () => {
    // A category whose parent was deleted vanishing from the picker is the
    // same failure this exists to fix.
    const tree = buildCategoryTree([
      ...ROWS,
      { id: "lost", name: "Orphan", parentId: "deleted-parent" },
    ]);
    assert.ok(tree.some((n) => n.id === "lost"));
  });

  it("does not hang on a cycle", () => {
    // Should be impossible, but this walks links from data somebody can edit,
    // and an infinite recursion takes out every screen that lists categories.
    const tree = buildCategoryTree([
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ]);
    assert.ok(flattenCategoryTree(tree).length <= 2);
  });

  it("copes with nothing at all", () => {
    assert.deepEqual(buildCategoryTree([]), []);
  });
});

describe("ticking a whole branch", () => {
  it("returns the node and everything under it", () => {
    const dental = buildCategoryTree(ROWS)[0];
    assert.deepEqual(branchIds(dental).sort(), ["anaes", "dental", "needles", "topical"]);
  });

  it("is just the node when it has no children", () => {
    const gloves = buildCategoryTree(ROWS)[1].children[0];
    assert.deepEqual(branchIds(gloves), ["gloves"]);
  });
});

describe("searching the tree", () => {
  const tree = buildCategoryTree(ROWS);

  it("returns everything for an empty query", () => {
    assert.equal(flattenCategoryTree(filterCategoryTree(tree, "  ")).length, ROWS.length);
  });

  it("matches across the whole path, not just the leaf name", () => {
    // "dental needles" appears as two words in no single name. Searching a
    // 446-item tree by leaf name means already knowing the leaf name.
    const hit = flattenCategoryTree(filterCategoryTree(tree, "dental needles"));
    assert.ok(hit.some((n) => n.id === "needles"));
  });

  it("keeps a match's ancestors so the result still reads as a tree", () => {
    const found = filterCategoryTree(tree, "topical");
    assert.equal(found.length, 1);
    assert.equal(found[0].id, "dental");
    assert.equal(found[0].children[0].id, "anaes");
    assert.equal(found[0].children[0].children[0].id, "topical");
  });

  it("keeps the whole subtree under a branch that matches", () => {
    // Somebody searching "anaesthetic" wants what is under it.
    const found = flattenCategoryTree(filterCategoryTree(tree, "anaesthetic"));
    assert.ok(found.some((n) => n.id === "needles"));
    assert.ok(found.some((n) => n.id === "topical"));
  });

  it("ignores case and extra spacing", () => {
    assert.equal(flattenCategoryTree(filterCategoryTree(tree, "  GLOVES ")).length, 2);
  });

  it("returns nothing when nothing matches", () => {
    assert.deepEqual(filterCategoryTree(tree, "zzzz"), []);
  });
});
