import "server-only";

import { randomInt } from "node:crypto";
import { db } from "./db";
import { hashPassword } from "./auth";
import { requireAdmin, audit } from "./admin";
import {
  applicationDecided,
  applicationReceived,
  emailVerification,
  isSendableAddress,
} from "./email-message";
import { send, sendQuietly } from "./mailer";
import { publicUrl } from "./public-url";
import { readAddressParts } from "./geo";
import { normaliseTrn } from "./trn";
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_MINUTES,
  checkOtp,
  otpExpiry,
  validateApplication,
  type ApplicationInput,
} from "./registration";

/**
 * Opening a trade account, from the form to the decision.
 *
 * The rules are in registration.ts, pure and tested. This is the part that
 * touches the database and the mail seam.
 *
 * One thing worth stating plainly, because it decides the shape of everything
 * here: an application creates a real User and a real Organisation
 * immediately, both marked Pending. The alternative — a separate applications
 * table copied across on approval — means every field exists in two places and
 * the copy is where the bugs live. Nothing can be done with a Pending account:
 * signIn refuses it, and it holds no terms, no credit limit and no pricing
 * until a person sets them.
 */

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string, field?: string): Result<never> => ({
  ok: false,
  error,
  field,
});

/** Six digits, from a real random source rather than Math.random. */
function newOtp(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/* ------------------------------------------------------------------ *
 * Applying
 * ------------------------------------------------------------------ */

export async function applyForAccount(
  input: ApplicationInput & { countryCode?: string; phoneNational?: string }
): Promise<Result<{ email: string }>> {
  const problems = validateApplication(input);
  if (problems.length > 0) {
    return fail(problems[0]!.message, problems[0]!.field);
  }

  const email = input.email.trim().toLowerCase();
  const where = readAddressParts({
    countryCode: input.countryCode,
    phoneNational: input.phoneNational,
    phone: input.phone,
  });

  const existing = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      isVerified: true,
      approvalStatus: true,
      organisationId: true,
    },
  });

  if (existing) {
    // An unverified application can be resubmitted — somebody who mistyped a
    // password and came back should not be locked out of their own address by
    // a half-finished attempt. Anything further along is a real account.
    if (existing.isVerified || existing.approvalStatus !== "Pending") {
      return fail(
        "There is already an account for that address. Try signing in, or email info@aussiemed.com.",
        "email"
      );
    }

    // The organisation goes with the user. Deleting only the user orphaned an
    // Organisation row on every resubmission — invisible on every screen,
    // counted by every "how many customers do we have", and one per abandoned
    // attempt. Only ever a self-registered one with nobody else on it: an
    // organisation an admin set up, or one with another user, is not this
    // application's to remove.
    await db.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: existing.id } });

      if (!existing.organisationId) return;
      const organisation = await tx.organisation.findUnique({
        where: { id: existing.organisationId },
        select: {
          id: true,
          isSelfRegistered: true,
          _count: { select: { users: true, orders: true } },
        },
      });
      if (
        organisation?.isSelfRegistered &&
        organisation._count.users === 0 &&
        organisation._count.orders === 0
      ) {
        await tx.organisation.delete({ where: { id: organisation.id } });
      }
    });
  }

  const code = newOtp();
  const now = new Date();

  const user = await db.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({
      data: {
        name: input.companyName.trim(),
        trn: normaliseTrn(input.trn),
        phone: where.phone,
        countryCode: where.countryCode,
        isSelfRegistered: true,
      },
    });

    return tx.user.create({
      data: {
        email,
        name: input.contactName.trim(),
        phone: where.phone,
        role: "Customer",
        passwordHash: input.viaGoogle ? null : await hashPassword(input.password),
        authProvider: input.viaGoogle ? "Google" : "Password",
        // Google has already proved the address, so there is nothing for an
        // OTP to establish and asking for one is a step for its own sake.
        isVerified: Boolean(input.viaGoogle),
        approvalStatus: "Pending",
        appliedAt: now,
        otpCode: input.viaGoogle ? null : code,
        otpExpiresAt: input.viaGoogle ? null : otpExpiry(now),
        organisationId: organisation.id,
      },
      select: { id: true, email: true, name: true },
    });
  });

  if (input.viaGoogle) {
    await announceApplication(user.id);
  } else {
    // The code is the only thing standing between a typo and an account
    // nobody can reach, so a failure to send is a failure to apply.
    const outcome = await send(
      emailVerification({
        to: email,
        contactName: user.name,
        code,
        minutes: OTP_MINUTES,
      }),
      { entity: "User", entityId: user.id }
    );
    if (outcome.status === "Failed" || outcome.status === "Suppressed") {
      return fail(
        "We could not send the confirmation code to that address. Check it and try again.",
        "email"
      );
    }
  }

  return ok({ email });
}

/* ------------------------------------------------------------------ *
 * Proving the address
 * ------------------------------------------------------------------ */

export async function verifyEmail(input: {
  email: string;
  code: string;
}): Promise<Result<{ verified: true }>> {
  const email = input.email.trim().toLowerCase();

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      isVerified: true,
      otpCode: true,
      otpExpiresAt: true,
      otpAttempts: true,
    },
  });

  // Deliberately the same answer for "no such address" and "wrong code": this
  // endpoint is unauthenticated, and a distinct message would turn it into a
  // way to find out which addresses have accounts.
  const generic = "That code is not right, or it has expired. Ask for a new one.";
  if (!user) return fail(generic, "code");
  if (user.isVerified) return ok({ verified: true });

  if ((user.otpAttempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return fail(
      "Too many attempts on that code. Ask for a new one.",
      "code"
    );
  }

  const verdict = checkOtp({
    typed: input.code,
    expected: user.otpCode,
    expiresAt: user.otpExpiresAt,
    now: new Date(),
  });

  if (!verdict.ok) {
    // Counted before the answer is returned, so a script cannot spend its
    // attempts faster than they are recorded.
    await db.user.update({
      where: { id: user.id },
      data: { otpAttempts: { increment: 1 } },
    });
    return fail(generic, "code");
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      // Spent. A code left valid after use is a second key to the account.
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    },
  });

  await announceApplication(user.id);
  return ok({ verified: true });
}

export async function resendOtp(email: string): Promise<Result> {
  const handle = email.trim().toLowerCase();
  const user = await db.user.findUnique({
    where: { email: handle },
    select: { id: true, name: true, isVerified: true },
  });

  // Always the same answer, whether or not the address exists. Otherwise this
  // is a way to enumerate customers.
  const same = ok(undefined);
  if (!user || user.isVerified) return same;

  const code = newOtp();
  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: { otpCode: code, otpExpiresAt: otpExpiry(now), otpAttempts: 0 },
  });

  await sendQuietly(
    emailVerification({
      to: handle,
      contactName: user.name,
      code,
      minutes: OTP_MINUTES,
    }),
    { entity: "User", entityId: user.id }
  );
  return same;
}

/** Confirms to the applicant, and tells the office there is one to look at. */
async function announceApplication(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      organisation: { select: { name: true } },
    },
  });
  if (!user || !isSendableAddress(user.email)) return;

  await sendQuietly(
    applicationReceived({
      to: user.email,
      contactName: user.name,
      companyName: user.organisation?.name ?? "your practice",
    }),
    { entity: "User", entityId: userId }
  );
}

/* ------------------------------------------------------------------ *
 * The decision
 * ------------------------------------------------------------------ */

export async function pendingApplications() {
  await requireAdmin("customers", "view");

  return db.user.findMany({
    where: { role: "Customer", approvalStatus: "Pending", isDisabled: false },
    orderBy: { appliedAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      isVerified: true,
      appliedAt: true,
      organisation: {
        select: { id: true, name: true, trn: true, countryCode: true },
      },
    },
  });
}

export async function decideApplication(input: {
  userId: string;
  approve: boolean;
  reason?: string | null;
}): Promise<Result<{ email: string }>> {
  const actor = await requireAdmin("customers");

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      name: true,
      approvalStatus: true,
      organisationId: true,
      organisation: { select: { name: true } },
    },
  });
  if (!user) return fail("That application no longer exists.");
  if (user.approvalStatus !== "Pending") {
    return fail(`That application has already been ${user.approvalStatus.toLowerCase()}.`);
  }

  const reason = (input.reason ?? "").trim();
  // A refusal with no reason produces an email nobody can act on, and a phone
  // call rather than a corrected application.
  if (!input.approve && !reason) {
    return fail("Give a reason — it goes to the applicant.", "reason");
  }

  const now = new Date();
  await db.user.update({
    where: { id: user.id },
    data: {
      approvalStatus: input.approve ? "Approved" : "Rejected",
      approvedAt: input.approve ? now : null,
      approvedBy: actor.id,
      rejectedReason: input.approve ? null : reason,
    },
  });

  await audit(
    actor,
    input.approve ? "application.approve" : "application.reject",
    "User",
    user.id,
    { approvalStatus: "Pending" },
    {
      approvalStatus: input.approve ? "Approved" : "Rejected",
      organisation: user.organisation?.name ?? null,
      reason: input.approve ? null : reason,
    }
  );

  await sendQuietly(
    applicationDecided({
      to: user.email,
      contactName: user.name,
      companyName: user.organisation?.name ?? "your practice",
      approved: input.approve,
      reason: input.approve ? null : reason,
      signInUrl: `${publicUrl()}/sign-in`,
    }),
    { entity: "User", entityId: user.id }
  );

  return ok({ email: user.email });
}
