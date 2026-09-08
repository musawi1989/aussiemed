import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BULK_BUY_STATUSES,
  buyerProgress,
  isBulkBuyStatus,
  isOpen,
  normaliseStatus,
  queueOrder,
  statusLabel,
} from "./bulk-buy-requests.ts";

describe("the two states", () => {
  it("has exactly two, and they are the ones the client asked for", () => {
    assert.deepEqual([...BULK_BUY_STATUSES], ["Pending", "Completed"]);
  });

  it("accepts only those two", () => {
    assert.ok(isBulkBuyStatus("Pending"));
    assert.ok(isBulkBuyStatus("Completed"));
    assert.ok(!isBulkBuyStatus("Quoted"));
    assert.ok(!isBulkBuyStatus("pending"));
    assert.ok(!isBulkBuyStatus(null));
  });
});

describe("whether a request is still open", () => {
  it("is open unless it is completed", () => {
    assert.equal(isOpen("Pending"), true);
    assert.equal(isOpen("Completed"), false);
  });

  it("treats a value left over from the old axis as open", () => {
    /*
     * Load-bearing. A row still carrying New or Quoted — missed by a
     * migration, written by an older deploy, restored from a backup — must
     * surface in the queue rather than disappear from it.
     *
     * The two failures are not equal. A finished request shown as open costs
     * somebody one glance. An open one that vanishes is a customer nobody
     * answers, and nothing on any screen says so.
     */
    for (const stale of ["New", "Quoted", "Answered", "", null, undefined]) {
      assert.equal(isOpen(stale), true, String(stale));
    }
  });

  it("normalises anything unknown to Pending", () => {
    assert.equal(normaliseStatus("Completed"), "Completed");
    assert.equal(normaliseStatus("Quoted"), "Pending");
    assert.equal(normaliseStatus(null), "Pending");
    assert.equal(statusLabel("New"), "Pending");
  });
});

describe("what the buyer is told", () => {
  it("says we have it when nobody has replied yet", () => {
    const p = buyerProgress({ status: "Pending", replyToCustomer: null });
    assert.equal(p.headline, "With our team");
    assert.equal(p.answered, false);
    assert.equal(p.open, true);
  });

  it("distinguishes answered-and-open from not-yet-looked-at", () => {
    // "Pending" alone cannot tell a buyer waiting on us apart from a buyer we
    // are waiting on, and those are different situations to be in.
    const p = buyerProgress({ status: "Pending", replyToCustomer: "AED 12.40 a box." });
    assert.equal(p.headline, "Answered");
    assert.equal(p.answered, true);
    assert.equal(p.open, true);
  });

  it("says completed once it is closed off", () => {
    const p = buyerProgress({ status: "Completed", replyToCustomer: "AED 12.40 a box." });
    assert.equal(p.headline, "Completed");
    assert.equal(p.open, false);
    assert.match(p.detail, /reply is below/);
  });

  it("does not promise a reply that is not there on a completed request", () => {
    // Closed without an answer is a real outcome — settled on the phone, or
    // withdrawn — and pointing the buyer at a reply that does not exist is
    // worse than saying nothing.
    const p = buyerProgress({ status: "Completed", replyToCustomer: null });
    assert.equal(p.answered, false);
    assert.ok(!/reply is below/.test(p.detail));
  });

  it("does not read whitespace as an answer", () => {
    const p = buyerProgress({ status: "Pending", replyToCustomer: "   " });
    assert.equal(p.answered, false);
    assert.equal(p.headline, "With our team");
  });

  it("copes with a request carrying no reply field at all", () => {
    const p = buyerProgress({ status: "Pending" });
    assert.equal(p.answered, false);
  });
});

describe("the queue order", () => {
  const at = (iso: string) => new Date(iso);

  it("puts open requests first and the oldest of those at the top", () => {
    const rows = [
      { id: "done-old", status: "Completed", createdAt: at("2026-01-01T00:00:00Z") },
      { id: "open-new", status: "Pending", createdAt: at("2026-09-01T00:00:00Z") },
      { id: "open-old", status: "Pending", createdAt: at("2026-03-01T00:00:00Z") },
      { id: "done-new", status: "Completed", createdAt: at("2026-09-02T00:00:00Z") },
    ];
    assert.deepEqual(
      queueOrder(rows).map((r) => r.id),
      ["open-old", "open-new", "done-old", "done-new"]
    );
  });

  it("ranks a stale status alongside the open ones", () => {
    const rows = [
      { id: "completed", status: "Completed", createdAt: at("2026-01-01T00:00:00Z") },
      { id: "quoted", status: "Quoted", createdAt: at("2026-02-01T00:00:00Z") },
    ];
    assert.deepEqual(queueOrder(rows).map((r) => r.id), ["quoted", "completed"]);
  });

  it("does not modify what it was given", () => {
    const rows = [
      { id: "b", status: "Completed", createdAt: at("2026-01-01T00:00:00Z") },
      { id: "a", status: "Pending", createdAt: at("2026-02-01T00:00:00Z") },
    ];
    queueOrder(rows);
    assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
  });

  it("copes with nothing", () => {
    assert.deepEqual(queueOrder([]), []);
  });
});
