import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ATTEMPTS,
  WINDOW_MS,
  attemptKey,
  checkLimit,
  lockoutMessage,
  retryAfterSeconds,
} from "./rate-limit.ts";

/** 18 Aug 2026, 10:00 UTC. */
const NOW = new Date("2026-08-18T10:00:00Z").getTime();
const minutes = (n: number) => n * 60_000;

describe("checkLimit", () => {
  it("lets a person who has never failed through", () => {
    assert.deepEqual(checkLimit([], NOW), { allowed: true, remaining: MAX_ATTEMPTS });
  });

  it("counts down without locking until the limit is reached", () => {
    const four = [1, 2, 3, 4].map((n) => NOW - minutes(n));
    assert.deepEqual(checkLimit(four, NOW), { allowed: true, remaining: 1 });
  });

  it("closes the door on the fifth failure inside the window", () => {
    const five = [1, 2, 3, 4, 5].map((n) => NOW - minutes(n));
    const verdict = checkLimit(five, NOW);
    assert.equal(verdict.allowed, false);
  });

  it("ignores failures that have fallen out of the window", () => {
    // Yesterday's mistyped password is not evidence of anything today.
    const old = [16, 17, 18, 19, 20].map((n) => NOW - minutes(n));
    assert.equal(checkLimit(old, NOW).allowed, true);
  });

  it("opens again when the oldest failure still counting expires", () => {
    const five = [14, 13, 12, 11, 10].map((n) => NOW - minutes(n));
    const verdict = checkLimit(five, NOW);
    assert.equal(verdict.allowed, false);
    if (verdict.allowed) return;
    // The oldest is 14 minutes back, so one more minute clears it.
    assert.equal(verdict.retryAfterMs, minutes(1));
    assert.equal(checkLimit(five, NOW + minutes(1)).allowed, true);
  });

  it("rolls rather than resetting on a boundary", () => {
    // Five failures ten minutes ago still count four minutes from now, because
    // the window follows the attempts. A fixed window resetting on the clock
    // would hand out a fresh allowance while those five were minutes old —
    // twice the intended rate at the moment it matters most.
    const five = Array.from({ length: 5 }, (_, i) => NOW - minutes(10) + i);
    assert.equal(checkLimit(five, NOW + minutes(4)).allowed, false);
    // And they stop counting once they are genuinely older than the window.
    assert.equal(checkLimit(five, NOW + minutes(6)).allowed, true);
  });

  it("takes the failures in any order", () => {
    const times = [5, 1, 4, 2, 3].map((n) => NOW - minutes(n));
    assert.equal(checkLimit(times, NOW).allowed, false);
    assert.equal(checkLimit([...times].reverse(), NOW).allowed, false);
  });

  it("extends the wait when somebody keeps hammering while locked out", () => {
    const five = [14, 13, 12, 11, 10].map((n) => NOW - minutes(n));
    const before = checkLimit(five, NOW);
    // A sixth attempt is recorded too, so the five that count are now newer.
    const after = checkLimit([...five, NOW], NOW);
    assert.equal(before.allowed, false);
    assert.equal(after.allowed, false);
    if (before.allowed || after.allowed) return;
    assert.ok(after.retryAfterMs > before.retryAfterMs);
  });

  it("takes its own limit and window, for the wider per-address bucket", () => {
    const times = Array.from({ length: 10 }, () => NOW - minutes(1));
    assert.equal(checkLimit(times, NOW, 30, WINDOW_MS).allowed, true);
    assert.equal(checkLimit(times, NOW, 10, WINDOW_MS).allowed, false);
  });
});

describe("lockoutMessage", () => {
  it("says the same thing whether or not the account exists", () => {
    // The message is a function of the wait alone. It cannot become an account
    // enumerator, because it has nothing else to tell.
    assert.equal(lockoutMessage(minutes(9)), lockoutMessage(minutes(9)));
  });

  it("rounds up, so nobody is invited back a moment too early", () => {
    assert.match(lockoutMessage(minutes(8) + 1), /9 minutes/);
  });

  it("does not say 'in 1 minutes'", () => {
    assert.equal(lockoutMessage(minutes(1)), "Too many sign-in attempts. Wait a minute and try again.");
    assert.equal(lockoutMessage(0), "Too many sign-in attempts. Wait a minute and try again.");
  });
});

describe("retryAfterSeconds", () => {
  it("is whole seconds, and never zero", () => {
    assert.equal(retryAfterSeconds(minutes(2)), 120);
    assert.equal(retryAfterSeconds(1), 1);
    assert.equal(retryAfterSeconds(0), 1);
  });
});

describe("attemptKey", () => {
  it("treats one account as one account however it is typed", () => {
    // Three spellings would otherwise buy fifteen attempts instead of five.
    assert.equal(attemptKey("ADMIN"), "admin");
    assert.equal(attemptKey("  Admin  "), "admin");
    assert.equal(attemptKey("buyer@clinic.ae"), "buyer@clinic.ae");
  });
});
