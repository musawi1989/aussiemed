import "server-only";
import { canSignIn } from "./registration";

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";

/**
 * Sessions and password verification.
 *
 * Passwords are hashed with scrypt from Node's own crypto module — a proper
 * password KDF, deliberately slow, and no dependency to keep patched. The
 * backend spec asks for bcrypt; scrypt is an equivalent choice and costs
 * nothing to swap later since only this file knows the format.
 *
 * The spec also specifies passwordless email OTP. Passwords were asked for
 * instead; both are recorded in the register (BE-15).
 */

const scryptAsync = promisify(scrypt);

const SESSION_COOKIE = "aussiemed_session";
/** INVENTED VALUE: sessions last 7 days. Logged as BE-16. */
const SESSION_DAYS = 7;

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

/** Format: scrypt$<salt-hex>$<hash-hex>, so the algorithm is self-describing. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null
): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length
  )) as Buffer;

  // Constant time: a fast rejection would leak how much of the hash matched.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ */

export type SessionUser = {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: string;
  organisationId: string | null;
  supplierId: string | null;
};

/**
 * Signs in by username or email.
 *
 * The same message is returned whether the account is unknown or the password
 * is wrong, so the form cannot be used to discover which addresses exist.
 */
export async function signIn(
  identifier: string,
  password: string
): Promise<
  | { ok: true; user: SessionUser }
  | { ok: false; message: string; needsVerification?: boolean }
> {
  const handle = identifier.trim().toLowerCase();
  const generic = "Those details do not match an account";

  const user = await db.user.findFirst({
    where: { OR: [{ email: handle }, { username: handle }] },
    include: { supplier: true },
  });

  if (!user || user.isDisabled) return { ok: false, message: generic };
  if (!(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, message: generic };
  }

  /**
   * The password was right. Now: are they allowed in?
   *
   * Deliberately after the password check, and deliberately specific. Before
   * it, "your application is pending" would tell anyone who typed an address
   * whether it is registered. After it, the person has already proved who they
   * are, and being told "those details do not match an account" when their
   * application is sitting in a queue is a lie that produces a support call.
   */
  const verdict = canSignIn({
    isVerified: user.isVerified,
    approvalStatus: user.approvalStatus,
    isDisabled: user.isDisabled,
    rejectedReason: user.rejectedReason,
  });
  if (!verdict.allowed) {
    return {
      ok: false,
      message: verdict.reason,
      needsVerification: verdict.canResendOtp === true,
    };
  }

  const token = randomUUID() + randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({ data: { token, userId: user.id, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
      supplierId: user.supplier?.id ?? null,
    },
  };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  // Delete the row, not just the cookie — otherwise a copied cookie still works.
  if (token) await db.session.deleteMany({ where: { token } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: { user: { include: { supplier: true } } },
  });

  if (!session || session.expiresAt < new Date()) return null;
  if (session.user.isDisabled) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    username: session.user.username,
    name: session.user.name,
    role: session.user.role,
    organisationId: session.user.organisationId,
    supplierId: session.user.supplier?.id ?? null,
  };
}

export async function requireRole(...roles: string[]) {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}

/** Housekeeping — expired rows serve no purpose. */
export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
