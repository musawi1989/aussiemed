import "server-only";

import { db } from "./db";
import {
  MAX_ATTEMPTS,
  MAX_ATTEMPTS_PER_ADDRESS,
  WINDOW_MS,
  attemptKey,
  checkLimit,
  type LimitVerdict,
} from "./rate-limit";

/**
 * Where failed sign-ins are kept, and the two questions asked of them — SEC-02.
 *
 * The arithmetic is in rate-limit.ts and tested there. This file is the part
 * that needs a database: reading the failures that still count, recording a new
 * one, and clearing them when somebody finally gets in.
 *
 * Two buckets, because they stop different attacks. The identifier bucket stops
 * one account being worked through; the address bucket stops a script trying
 * one password against five hundred accounts, where no single account ever
 * reaches its own limit.
 */

/** Requests carry no address of their own — it comes from the proxy in front. */
export function addressFrom(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // The left-most entry is the original client. Everything after it was
    // added by a hop, and behind an unknown proxy (IN-01) any of it may be
    // invented — which is why this only ever widens the limit, never lifts it.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = request.headers.get("x-real-ip");
  return real ? real.trim().slice(0, 64) : null;
}

export type SignInGate =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export async function checkSignInAllowed(
  identifier: string,
  address: string | null
): Promise<SignInGate> {
  const since = new Date(Date.now() - WINDOW_MS);
  const key = attemptKey(identifier);

  const [forKey, forAddress] = await Promise.all([
    db.signInAttempt.findMany({
      where: { key, at: { gte: since } },
      select: { at: true },
    }),
    address
      ? db.signInAttempt.findMany({
          where: { address, at: { gte: since } },
          select: { at: true },
        })
      : Promise.resolve([]),
  ]);

  const now = Date.now();
  const verdicts: LimitVerdict[] = [
    checkLimit(forKey.map((row) => row.at.getTime()), now, MAX_ATTEMPTS),
  ];
  if (address) {
    verdicts.push(
      checkLimit(
        forAddress.map((row) => row.at.getTime()),
        now,
        MAX_ATTEMPTS_PER_ADDRESS
      )
    );
  }

  // The longest wait wins: being inside one limit is no help while outside the
  // other.
  const blocked = verdicts.filter((v) => !v.allowed) as {
    allowed: false;
    retryAfterMs: number;
  }[];
  if (blocked.length === 0) return { allowed: true };

  return {
    allowed: false,
    retryAfterMs: Math.max(...blocked.map((v) => v.retryAfterMs)),
  };
}

/**
 * Recorded for a refused attempt whatever the reason — wrong password, unknown
 * account, or an attempt made while already locked out. That last one is
 * deliberate: hammering the endpoint has to extend the wait, or a script simply
 * keeps knocking until the window rolls.
 */
export async function recordSignInFailure(
  identifier: string,
  address: string | null
): Promise<void> {
  await db.signInAttempt.create({
    data: { key: attemptKey(identifier), address },
  });

  // Old rows are worthless — the window has passed and this is not an audit
  // trail. Cleared here rather than by a scheduled job, because no scheduler
  // exists (BE-17) and a table that only grows is how a limiter becomes a
  // performance problem.
  await db.signInAttempt.deleteMany({
    where: { at: { lt: new Date(Date.now() - WINDOW_MS) } },
  });
}

/**
 * Getting in clears the account's failures, so somebody who mistypes twice and
 * then signs in does not carry three strikes into tomorrow. The address bucket
 * is untouched: a successful sign-in from one address says nothing about the
 * four hundred failures that came from it.
 */
export async function clearSignInFailures(identifier: string): Promise<void> {
  await db.signInAttempt.deleteMany({ where: { key: attemptKey(identifier) } });
}
