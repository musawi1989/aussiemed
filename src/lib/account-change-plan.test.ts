import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGE_KINDS,
  REASON_MAX,
  REASON_MIN,
  branchDiff,
  checkBranch,
  checkReason,
  hasTakenEffect,
  initialStatus,
  isChangeKind,
  needsApproval,
  statusLabel,
  summarise,
  type BranchPayload,
} from "./account-change-plan.ts";

const BRANCH: BranchPayload = {
  label: "Jumeirah clinic",
  contact: "Reception",
  phone: "04 555 0100",
  line1: "12 Beach Road",
  line2: "Level 2",
  city: "Dubai",
  emirate: "Dubai",
  country: "United Arab Emirates",
  countryCode: "AE",
};

describe("what needs approval", () => {
  it("lets an account manage its own staff list without waiting on us", () => {
    // Holding "Dr Haddad has left" for approval would mean an order going out
    // in the name of someone who no longer works there.
    assert.equal(needsApproval("StaffAdded"), false);
    assert.equal(needsApproval("StaffRemoved"), false);
    assert.equal(initialStatus("StaffAdded"), "Applied");
  });

  it("holds anything that moves goods or changes an invoice", () => {
    for (const kind of ["BranchAdded", "BranchEdited", "BranchRemoved", "AccountRenamed"] as const) {
      assert.equal(needsApproval(kind), true, kind);
      assert.equal(initialStatus(kind), "Pending", kind);
    }
  });

  it("defaults an unknown kind to needing approval, not to waving it through", () => {
    // A kind added later and forgotten here must fail closed.
    assert.equal(needsApproval("SomethingNew" as never), true);
  });

  it("recognises exactly the kinds it defines", () => {
    for (const kind of CHANGE_KINDS) assert.equal(isChangeKind(kind), true, kind);
    assert.equal(isChangeKind("Whatever"), false);
  });
});

describe("the reason", () => {
  it("refuses an empty one, which is the whole point of the log", () => {
    assert.equal(checkReason("").ok, false);
    assert.equal(checkReason("   ").ok, false);
    assert.equal(checkReason(null).ok, false);
    assert.equal(checkReason(undefined).ok, false);
  });

  it("refuses a keystroke standing in for a reason", () => {
    assert.equal(checkReason(".").ok, false);
    assert.equal(checkReason("x").ok, false);
    assert.equal(checkReason("no reason").ok, false); // 9 characters
  });

  it("accepts a real one and tidies the whitespace", () => {
    const result = checkReason("  She   has left the\npractice  ");
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.reason, "She has left the practice");
  });

  it("accepts exactly the minimum, so the boundary is not off by one", () => {
    const exact = "a".repeat(REASON_MIN);
    assert.equal(checkReason(exact).ok, true);
    assert.equal(checkReason("a".repeat(REASON_MIN - 1)).ok, false);
  });

  it("refuses an essay", () => {
    assert.equal(checkReason("a".repeat(REASON_MAX)).ok, true);
    assert.equal(checkReason("a".repeat(REASON_MAX + 1)).ok, false);
  });

  it("explains what is wrong rather than only refusing", () => {
    const empty = checkReason("");
    assert.equal(empty.ok, false);
    assert.match(empty.ok === false ? empty.error : "", /why/i);
  });
});

describe("wording", () => {
  it("names the subject in every summary", () => {
    for (const kind of CHANGE_KINDS) {
      assert.match(summarise(kind, "Dr Reem Haddad"), /Dr Reem Haddad/, kind);
    }
  });

  it("does not produce a dangling summary when the subject is blank", () => {
    for (const kind of CHANGE_KINDS) {
      const line = summarise(kind, "   ");
      assert.ok(!/\s{2}/.test(line), kind);
      assert.ok(line.trim().length > 0, kind);
    }
  });

  it("translates the stored status into what a customer wants to know", () => {
    assert.equal(statusLabel("Applied"), "Done");
    assert.equal(statusLabel("Pending"), "Waiting for approval");
    assert.equal(statusLabel("Rejected"), "Not approved");
    // Never shows a developer's word for a state it has not been taught.
    assert.equal(statusLabel("Weird"), "Weird");
  });

  it("knows which statuses have actually changed the account", () => {
    assert.equal(hasTakenEffect("Applied"), true);
    assert.equal(hasTakenEffect("Approved"), true);
    assert.equal(hasTakenEffect("Pending"), false);
    assert.equal(hasTakenEffect("Rejected"), false);
  });
});

describe("branch details", () => {
  it("insists on the fields a courier cannot do without", () => {
    for (const missing of ["label", "contact", "line1", "city"] as const) {
      const result = checkBranch({ ...BRANCH, [missing]: "  " });
      assert.equal(result.ok, false, missing);
    }
  });

  it("allows the optional ones to be blank", () => {
    const result = checkBranch({ ...BRANCH, phone: "", line2: "", emirate: "" });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.branch.phone, "");
  });

  it("tidies whitespace so two spellings of one address are one address", () => {
    const result = checkBranch({ ...BRANCH, line1: "  12   Beach   Road " });
    assert.equal(result.ok && result.branch.line1, "12 Beach Road");
  });

  it("names the field that is missing rather than failing vaguely", () => {
    const result = checkBranch({ ...BRANCH, city: "" });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /City/);
  });
});

describe("branchDiff", () => {
  it("shows only what changed, so a reviewer is not reading unchanged lines", () => {
    const diff = branchDiff(BRANCH, { ...BRANCH, phone: "04 555 0999" });
    assert.equal(diff.length, 1);
    assert.deepEqual(diff[0], {
      label: "Phone",
      from: "04 555 0100",
      to: "04 555 0999",
    });
  });

  it("returns nothing when nothing changed", () => {
    assert.deepEqual(branchDiff(BRANCH, BRANCH), []);
  });

  it("treats every filled field of a new branch as new", () => {
    const diff = branchDiff(null, BRANCH);
    assert.equal(diff.length, 8);
    assert.ok(diff.every((d) => d.from === ""));
  });

  it("omits the blank fields of a new branch rather than listing empties", () => {
    const diff = branchDiff(null, { ...BRANCH, phone: "", line2: "", emirate: "" });
    assert.equal(diff.length, 5);
    assert.ok(!diff.some((d) => d.label === "Phone"));
  });

  it("shows a reviewer the country's name, never its code", () => {
    // "Country: United Arab Emirates -> Oman" means something to the person
    // approving it. "AE -> OM" is a puzzle, and the code is not what they are
    // being asked to agree to.
    const diff = branchDiff(BRANCH, {
      ...BRANCH,
      country: "Oman",
      countryCode: "OM",
    });
    assert.deepEqual(diff, [
      { label: "Country", from: "United Arab Emirates", to: "Oman" },
    ]);
  });

  it("reports a field being cleared, which is a change like any other", () => {
    const diff = branchDiff(BRANCH, { ...BRANCH, line2: "" });
    assert.deepEqual(diff, [{ label: "Unit or floor", from: "Level 2", to: "" }]);
  });

  it("copes with a previous version missing fields entirely", () => {
    // An address written before line2 existed on the form.
    const diff = branchDiff({ label: "Jumeirah clinic" }, BRANCH);
    assert.ok(!diff.some((d) => d.label === "Branch name"));
    assert.ok(diff.some((d) => d.label === "City" && d.from === ""));
  });
});
