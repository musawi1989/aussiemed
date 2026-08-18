/**
 * How many sign-in attempts are too many — SEC-02.
 *
 * Nothing limited password attempts, so the sign-in endpoint could be tried at
 * whatever rate a script could manage. Passwords here are chosen by people and
 * six characters long (SEC-03 is still open), which is a matter of minutes
 * against an unlimited endpoint.
 *
 * The arithmetic is pure and lives here so it can be tested without a database
 * and without waiting fifteen minutes for a lockout to expire. Where the
 * attempts are kept is sign-in-limit.ts.
 *
 * WHAT THIS DOES NOT DO. It does not stop a spray — one attempt each against a
 * thousand accounts — because it counts per identifier. A per-address bucket
 * rides alongside it where the host gives us a client address to trust, and
 * that is a question for IN-01: behind an unknown proxy a forwarded header is
 * a header anybody can set. Recorded rather than pretended away.
 */

/** Failures allowed inside the window before the door closes. */
export const MAX_ATTEMPTS = 5;

/** How far back failures count, in milliseconds. */
export const WINDOW_MS = 15 * 60 * 1000;

/**
 * A wider, looser limit for everything arriving from one address, so a script
 * working through a list of accounts meets a wall even though no single
 * account has hit its own limit.
 */
export const MAX_ATTEMPTS_PER_ADDRESS = 30;

export type LimitVerdict =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

/**
 * Failures are passed newest-first or oldest-first; order does not matter,
 * because the decision is about how many fall inside the window and when the
 * oldest of those leaves it.
 *
 * A rolling window rather than a fixed one: a fixed window lets an attacker
 * spend their whole allowance at 14:59 and the next allowance at 15:00, which
 * is twice the intended rate at the moment it matters most.
 */
export function checkLimit(
  failureTimes: readonly number[],
  now: number,
  max: number = MAX_ATTEMPTS,
  windowMs: number = WINDOW_MS
): LimitVerdict {
  const inWindow = failureTimes
    .filter((at) => now - at < windowMs)
    .sort((a, b) => a - b);

  if (inWindow.length < max) {
    return { allowed: true, remaining: max - inWindow.length };
  }

  // The door opens when the oldest failure still counting falls out of the
  // window. Every further attempt while locked out is itself recorded, so
  // hammering the endpoint extends the wait rather than shortening it.
  const oldest = inWindow[inWindow.length - max];
  const retryAfterMs = Math.max(0, windowMs - (now - oldest));

  return { allowed: false, retryAfterMs };
}

/**
 * What the person is told. Deliberately identical whether or not the account
 * exists: a message that only appears for real accounts is an account
 * enumerator, and the generic refusal above it exists for the same reason.
 */
export function lockoutMessage(retryAfterMs: number): string {
  const minutes = Math.ceil(retryAfterMs / 60_000);

  if (minutes <= 1) {
    return "Too many sign-in attempts. Wait a minute and try again.";
  }
  return `Too many sign-in attempts. Try again in ${minutes} minutes.`;
}

/** Seconds for the Retry-After header, which is defined in whole seconds. */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

/**
 * One key per account being attacked, not per spelling of it.
 *
 * "ADMIN", "admin" and " admin " are one account, and counting them separately
 * would hand an attacker three times the attempts for the price of a space.
 */
export function attemptKey(identifier: string): string {
  return identifier.trim().toLowerCase();
}
