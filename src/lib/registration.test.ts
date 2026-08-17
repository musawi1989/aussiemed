import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_PASSWORD,
  OTP_LENGTH,
  OTP_MINUTES,
  canSignIn,
  checkOtp,
  isAwaitingDecision,
  normaliseOtp,
  otpExpiry,
  validateApplication,
  type ApplicationInput,
} from "./registration.ts";

const NOW = new Date("2026-08-17T09:00:00.000Z");
const mins = (n: number) => new Date(NOW.getTime() + n * 60_000);

const GOOD: ApplicationInput = {
  companyName: "Al Barsha Family Clinic",
  trn: "100123456700003",
  contactName: "Layla Haddad",
  email: "procurement@albarsha.example",
  phone: "+971 501234567",
  password: "correct horse battery",
};

describe("the one-time code", () => {
  it("expires after the stated window", () => {
    assert.equal(otpExpiry(NOW).getTime() - NOW.getTime(), OTP_MINUTES * 60_000);
  });

  it("accepts a code pasted with the spaces from the email", () => {
    // Refusing "123 456" is refusing the right code for the space in it.
    assert.equal(normaliseOtp("123 456"), "123456");
    assert.equal(normaliseOtp(" 123-456 "), "123456");
    assert.equal(
      checkOtp({ typed: "123 456", expected: "123456", expiresAt: mins(5), now: NOW }).ok,
      true
    );
  });

  it("refuses a wrong code", () => {
    const result = checkOtp({ typed: "000000", expected: "123456", expiresAt: mins(5), now: NOW });
    assert.deepEqual(result, { ok: false, reason: "wrong" });
  });

  it("refuses an expired code, and says so before checking it", () => {
    // Expiry first, so an expired code cannot be told apart from a wrong one
    // by how long the answer takes.
    const expired = checkOtp({ typed: "123456", expected: "123456", expiresAt: mins(-1), now: NOW });
    assert.deepEqual(expired, { ok: false, reason: "expired" });
  });

  it("treats the exact expiry moment as expired", () => {
    const onTheDot = checkOtp({ typed: "123456", expected: "123456", expiresAt: NOW, now: NOW });
    assert.equal(onTheDot.ok, false);
  });

  it("refuses when there is no code to check against", () => {
    assert.deepEqual(
      checkOtp({ typed: "123456", expected: null, expiresAt: mins(5), now: NOW }),
      { ok: false, reason: "missing" }
    );
    assert.deepEqual(
      checkOtp({ typed: "123456", expected: "123456", expiresAt: null, now: NOW }),
      { ok: false, reason: "missing" }
    );
  });

  it("refuses a code of the wrong length even if it is a prefix", () => {
    assert.equal(
      checkOtp({ typed: "123", expected: "123456", expiresAt: mins(5), now: NOW }).ok,
      false
    );
    assert.equal(OTP_LENGTH, 6);
  });
});

describe("the application form", () => {
  it("accepts a complete one", () => {
    assert.deepEqual(validateApplication(GOOD), []);
  });

  const failing = (patch: Partial<ApplicationInput>) =>
    validateApplication({ ...GOOD, ...patch }).map((e) => e.field);

  it("requires a TRN, because it is what makes a tax invoice possible", () => {
    // Asking a month later means reissuing every document sent in between.
    assert.deepEqual(failing({ trn: "" }), ["trn"]);
  });

  it("requires the TRN to be fifteen digits", () => {
    assert.deepEqual(failing({ trn: "12345" }), ["trn"]);
    // Formatting is not the applicant's problem.
    assert.deepEqual(validateApplication({ ...GOOD, trn: "100 123 456 700 003" }), []);
  });

  it("requires a company, a person, an email and a number", () => {
    assert.deepEqual(failing({ companyName: "  " }), ["companyName"]);
    assert.deepEqual(failing({ contactName: "" }), ["contactName"]);
    assert.deepEqual(failing({ email: "" }), ["email"]);
    assert.deepEqual(failing({ phone: " " }), ["phone"]);
  });

  it("rejects an address that is not one", () => {
    assert.deepEqual(failing({ email: "not-an-address" }), ["email"]);
  });

  it("asks for length rather than symbols", () => {
    // A rule demanding a symbol produces "Password1!" on every account.
    assert.deepEqual(failing({ password: "short" }), ["password"]);
    assert.deepEqual(validateApplication({ ...GOOD, password: "a".repeat(MIN_PASSWORD) }), []);
  });

  it("does not ask a Google applicant for a password they never had", () => {
    assert.deepEqual(
      validateApplication({ ...GOOD, password: "", viaGoogle: true }),
      []
    );
  });

  it("reports every problem at once, not one at a time", () => {
    const fields = failing({ trn: "", email: "", phone: "" });
    assert.equal(fields.length, 3);
  });
});

describe("who may sign in", () => {
  const base = { isVerified: true, approvalStatus: "Approved", isDisabled: false };

  it("lets an approved, verified account in", () => {
    assert.deepEqual(canSignIn(base), { allowed: true });
  });

  it("holds an unverified address and offers the code again", () => {
    const verdict = canSignIn({ ...base, isVerified: false });
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.allowed === false && verdict.canResendOtp, true);
  });

  it("tells a waiting applicant they are waiting", () => {
    // "Those details do not match an account" to somebody whose application is
    // sitting in a queue is a lie that generates a support call.
    const verdict = canSignIn({ ...base, approvalStatus: "Pending" });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.allowed === false ? verdict.reason : "", /with our team/);
  });

  it("gives a rejected applicant the reason they were given", () => {
    const verdict = canSignIn({
      ...base,
      approvalStatus: "Rejected",
      rejectedReason: "We do not supply outside the UAE yet.",
    });
    assert.match(
      verdict.allowed === false ? verdict.reason : "",
      /do not supply outside the UAE/
    );
  });

  it("still says something useful when no reason was recorded", () => {
    const verdict = canSignIn({ ...base, approvalStatus: "Rejected", rejectedReason: "  " });
    assert.match(verdict.allowed === false ? verdict.reason : "", /info@aussiemed\.com/);
  });

  it("puts a closed account before every other reason", () => {
    const verdict = canSignIn({
      isDisabled: true,
      isVerified: false,
      approvalStatus: "Pending",
    });
    assert.match(verdict.allowed === false ? verdict.reason : "", /closed/);
  });
});

describe("what an admin has to look at", () => {
  it("counts only applications that have proved their email", () => {
    // An unverified application may be a typo and is not worth a person's time
    // until the applicant has shown the address reaches them.
    assert.equal(
      isAwaitingDecision({ isVerified: true, approvalStatus: "Pending", isDisabled: false }),
      true
    );
    assert.equal(
      isAwaitingDecision({ isVerified: false, approvalStatus: "Pending", isDisabled: false }),
      false
    );
    assert.equal(
      isAwaitingDecision({ isVerified: true, approvalStatus: "Approved", isDisabled: false }),
      false
    );
    assert.equal(
      isAwaitingDecision({ isVerified: true, approvalStatus: "Pending", isDisabled: true }),
      false
    );
  });
});
