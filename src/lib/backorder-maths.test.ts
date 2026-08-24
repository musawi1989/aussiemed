import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shortfallOf, takeFrom, type Allocation } from "./backorder-maths.ts";

describe("what counts as a back order", () => {
  it("is what they were asked for less what they promised", () => {
    assert.equal(shortfallOf({ qtyOrdered: 10, qtyConfirmed: 4 }), 6);
  });

  it("treats a confirmed none as the whole line", () => {
    // They answered, and the answer was none. That is a back order.
    assert.equal(shortfallOf({ qtyOrdered: 10, qtyConfirmed: 0 }), 10);
  });

  it("treats silence as no back order at all", () => {
    // The distinction the whole feature rests on. A null is a supplier who has
    // not answered yet — a chase, not a refusal. Re-sourcing on silence would
    // move orders nobody declined.
    assert.equal(shortfallOf({ qtyOrdered: 10, qtyConfirmed: null }), 0);
  });

  it("is nothing when they can send it all", () => {
    assert.equal(shortfallOf({ qtyOrdered: 10, qtyConfirmed: 10 }), 0);
  });

  it("never goes negative", () => {
    // Confirming more than was asked is not a surplus back order.
    assert.equal(shortfallOf({ qtyOrdered: 10, qtyConfirmed: 12 }), 0);
  });
});

describe("moving customer demand to the new supplier", () => {
  const allocations: Allocation[] = [
    { id: "a", orderItemId: "order-1", qty: 2 },
    { id: "b", orderItemId: "order-2", qty: 7 },
    { id: "c", orderItemId: "order-3", qty: 1 },
  ];

  it("moves exactly what was asked for", () => {
    const moves = takeFrom(allocations, 5);
    assert.equal(
      moves.reduce((n, m) => n + m.qty, 0),
      5
    );
  });

  it("takes from the largest first, touching as few rows as it can", () => {
    // Splitting one allocation of ten beats splitting ten of one: every split
    // is a row somebody may later have to read.
    const moves = takeFrom(allocations, 5);
    assert.equal(moves.length, 1);
    assert.equal(moves[0]!.id, "b");
    assert.equal(moves[0]!.qty, 5);
    assert.equal(moves[0]!.remaining, 2);
  });

  it("says what is left behind on each one", () => {
    // The caller updates or deletes from this, so it has to be right: a wrong
    // remaining either double-counts demand or loses it.
    const moves = takeFrom(allocations, 8);
    const b = moves.find((m) => m.id === "b")!;
    assert.equal(b.qty, 7);
    assert.equal(b.remaining, 0);
    const a = moves.find((m) => m.id === "a")!;
    assert.equal(a.qty, 1);
    assert.equal(a.remaining, 1);
  });

  it("empties an allocation exactly rather than leaving a nil row", () => {
    const moves = takeFrom([{ id: "x", orderItemId: "o", qty: 3 }], 3);
    assert.equal(moves[0]!.qty, 3);
    assert.equal(moves[0]!.remaining, 0);
  });

  it("keeps every unit accounted for", () => {
    // Nothing invented, nothing lost: what moves plus what stays equals what
    // there was.
    for (const wanted of [1, 3, 5, 9, 10]) {
      const moves = takeFrom(allocations, wanted);
      const moved = moves.reduce((n, m) => n + m.qty, 0);
      const remaining =
        moves.reduce((n, m) => n + m.remaining, 0) +
        allocations
          .filter((a) => !moves.some((m) => m.id === a.id))
          .reduce((n, a) => n + a.qty, 0);
      assert.equal(moved + remaining, 10, `asking for ${wanted}`);
    }
  });

  it("moves what exists when the allocations do not cover the shortfall", () => {
    // Happens when part of a line was bought to stock rather than against an
    // order. It moves what is attached and no more; the rest was never
    // somebody's demand to move.
    const moves = takeFrom(allocations, 50);
    assert.equal(
      moves.reduce((n, m) => n + m.qty, 0),
      10
    );
    assert.ok(moves.every((m) => m.remaining === 0));
  });

  it("moves nothing when there is nothing to move", () => {
    assert.deepEqual(takeFrom(allocations, 0), []);
    assert.deepEqual(takeFrom(allocations, -4), []);
    assert.deepEqual(takeFrom([], 5), []);
  });

  it("ignores an allocation of nothing rather than emitting an empty move", () => {
    const moves = takeFrom(
      [
        { id: "zero", orderItemId: "o", qty: 0 },
        { id: "real", orderItemId: "p", qty: 4 },
      ],
      2
    );
    assert.equal(moves.length, 1);
    assert.equal(moves[0]!.id, "real");
  });

  it("does not depend on the caller having sorted them", () => {
    const shuffled = [...allocations].reverse();
    assert.deepEqual(takeFrom(shuffled, 5), takeFrom(allocations, 5));
  });
});
