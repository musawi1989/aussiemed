import { db } from "./db";
import { getSessionUser } from "./auth";
import { accountChangeDecided } from "./email-message";
import { sendQuietly } from "./mailer";
import {
  branchDiff,
  checkReason,
  initialStatus,
  needsApproval,
  summarise,
  type BranchPayload,
  type ChangeKind,
  type FieldChange,
} from "./account-change-plan";

/**
 * Recording, requesting and reviewing changes to a customer account.
 *
 * Scoping is structural, as everywhere else in the account: no function here
 * takes an organisation id from its caller. The customer side reads it from
 * the session, and the admin side is guarded by role — a customer cannot
 * approve their own request by finding the right URL, because the approve
 * path checks the role before it reads the id.
 */

export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

type LogInput = {
  organisationId: string;
  kind: ChangeKind;
  subject: string;
  reason: string;
  payload?: unknown;
  targetId?: string;
  actor: { id: string; name: string };
};

/**
 * Writes one entry. Applied or Pending is decided by the kind, never by the
 * caller — a call site that could choose would eventually choose wrong, and
 * the wrong answer here is a delivery address changing without anyone
 * checking it.
 */
async function write(input: LogInput) {
  const status = initialStatus(input.kind);

  return db.accountChange.create({
    data: {
      organisationId: input.organisationId,
      kind: input.kind,
      summary: summarise(input.kind, input.subject),
      reason: input.reason,
      status,
      payload:
        status === "Pending" && input.payload !== undefined
          ? JSON.stringify(input.payload)
          : null,
      targetId: input.targetId ?? null,
      requestedByUserId: input.actor.id,
      requestedByName: input.actor.name,
    },
  });
}

/**
 * The single door every account change goes through.
 *
 * Returns whether it took effect, so the caller can tell the customer "done"
 * or "waiting on us" without deciding which for itself.
 */
export async function submitChange(input: {
  organisationId: string;
  kind: ChangeKind;
  subject: string;
  reason: string;
  payload?: unknown;
  targetId?: string;
  actor: { id: string; name: string };
  /** Runs only when the change takes effect at once. */
  apply?: () => Promise<void>;
}): Promise<Result<{ applied: boolean }>> {
  const reason = checkReason(input.reason);
  if (!reason.ok) return fail(reason.error);

  const held = needsApproval(input.kind);

  // Applied first, then logged: a change that is recorded but did not happen
  // is worse than one that happened and was not, because only the first makes
  // the log itself untrustworthy.
  if (!held && input.apply) await input.apply();

  await write({ ...input, reason: reason.reason });

  return ok({ applied: !held });
}

/* ------------------------------------------------------------------ *
 * Reading — the customer's side
 * ------------------------------------------------------------------ */

export type ChangeRow = Awaited<ReturnType<typeof accountChanges>>[number];

export async function accountChanges(organisationId: string) {
  return db.accountChange.findMany({
    where: { organisationId },
    orderBy: { requestedAt: "desc" },
    take: 200,
  });
}

/** Pending changes against one branch, so the branch can show its own. */
export async function pendingForTargets(organisationId: string) {
  const rows = await db.accountChange.findMany({
    where: { organisationId, status: "Pending", targetId: { not: null } },
    select: { id: true, targetId: true, kind: true, summary: true },
  });

  const byTarget = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (row.targetId) byTarget.set(row.targetId, row);
  return byTarget;
}

export async function pendingCountFor(organisationId: string): Promise<number> {
  return db.accountChange.count({
    where: { organisationId, status: "Pending" },
  });
}

/* ------------------------------------------------------------------ *
 * Reading — the admin's side
 * ------------------------------------------------------------------ */

async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return null;
  return user;
}

export async function pendingChanges() {
  if (!(await requireAdmin())) return [];

  return db.accountChange.findMany({
    where: { status: "Pending" },
    // Oldest first: the one that has been waiting longest is the one costing
    // a customer the most.
    orderBy: { requestedAt: "asc" },
    include: { organisation: { select: { id: true, name: true } } },
  });
}

export async function pendingChangeCount(): Promise<number> {
  if (!(await requireAdmin())) return 0;
  return db.accountChange.count({ where: { status: "Pending" } });
}

/**
 * What a reviewer is actually being asked to approve.
 *
 * For a branch, the fields that differ from what is there now — approving a
 * phone number should not mean reading seven unchanged address lines.
 */
export async function changeDetail(changeId: string): Promise<{
  diff: FieldChange[];
} | null> {
  if (!(await requireAdmin())) return null;

  const change = await db.accountChange.findUnique({ where: { id: changeId } });
  if (!change?.payload) return { diff: [] };

  let payload: BranchPayload;
  try {
    payload = JSON.parse(change.payload) as BranchPayload;
  } catch {
    // A payload written by an older shape must not take the queue down.
    return { diff: [] };
  }

  if (change.kind === "BranchAdded" || change.kind === "AccountRenamed") {
    return { diff: branchDiff(null, payload) };
  }

  const before = change.targetId
    ? await db.address.findUnique({ where: { id: change.targetId } })
    : null;

  return {
    diff: branchDiff(
      before
        ? {
            label: before.label ?? "",
            contact: before.contact,
            phone: before.phone,
            line1: before.line1,
            line2: before.line2 ?? "",
            city: before.city,
            emirate: before.emirate,
          }
        : null,
      payload
    ),
  };
}

/* ------------------------------------------------------------------ *
 * Deciding
 * ------------------------------------------------------------------ */

/**
 * Approve a held change and carry it out.
 *
 * The application and the decision are written in one transaction. A branch
 * that exists against a request still marked Pending would be approved twice
 * by the next click, and a decision recorded against a branch that was never
 * created is a lie in the log.
 */
export async function approveChange(
  changeId: string,
  note: string
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return fail("Only an administrator can approve a change.");

  const change = await db.accountChange.findUnique({ where: { id: changeId } });
  if (!change) return fail("That change no longer exists.");
  if (change.status !== "Pending") {
    return fail(`That change has already been ${change.status.toLowerCase()}.`);
  }

  let payload: BranchPayload | null = null;
  if (change.payload) {
    try {
      payload = JSON.parse(change.payload) as BranchPayload;
    } catch {
      return fail("The details of that request could not be read.");
    }
  }

  await db.$transaction(async (tx) => {
    switch (change.kind) {
      case "BranchAdded": {
        if (!payload) break;
        const existing = await tx.address.count({
          where: { organisationId: change.organisationId, isArchived: false },
        });
        await tx.address.create({
          data: {
            organisationId: change.organisationId,
            label: payload.label,
            contact: payload.contact,
            phone: payload.phone,
            line1: payload.line1,
            line2: payload.line2 || null,
            city: payload.city,
            emirate: payload.emirate,
            // The first address an account has is where its orders go.
            isDefault: existing === 0,
          },
        });
        break;
      }

      case "BranchEdited": {
        if (!payload || !change.targetId) break;
        await tx.address.update({
          where: { id: change.targetId },
          data: {
            label: payload.label,
            contact: payload.contact,
            phone: payload.phone,
            line1: payload.line1,
            line2: payload.line2 || null,
            city: payload.city,
            emirate: payload.emirate,
          },
        });
        break;
      }

      case "BranchRemoved": {
        if (!change.targetId) break;
        await tx.address.update({
          where: { id: change.targetId },
          // Archived, never deleted: orders already delivered there name it.
          data: { isArchived: true, isDefault: false },
        });
        break;
      }

      case "AccountRenamed": {
        if (!payload?.label) break;
        await tx.organisation.update({
          where: { id: change.organisationId },
          data: { name: payload.label },
        });
        break;
      }
    }

    await tx.accountChange.update({
      where: { id: changeId },
      data: {
        status: "Approved",
        payload: null,
        reviewedByUserId: admin.id,
        reviewedByName: admin.name,
        reviewedAt: new Date(),
        decisionNote: note.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "AccountChangeApproved",
        entity: "AccountChange",
        entityId: changeId,
        after: JSON.stringify({ kind: change.kind, summary: change.summary }),
      },
    });
  });

  await tellTheCustomer(change, true, note);
  return ok(undefined);
}

/**
 * Tells whoever asked for the change what was decided.
 *
 * Sent after the transaction, and never able to fail it: the change has
 * happened either way, and a customer who learns about it a day later on the
 * Account changes tab is a smaller problem than an approval rolled back
 * because a mailbox was full.
 *
 * The address is the person who raised it, not a generic account contact —
 * they are the one who will be wondering.
 */
async function tellTheCustomer(
  change: {
    id: string;
    organisationId: string;
    summary: string;
    reason: string;
    requestedByUserId: string | null;
    requestedByName: string;
  },
  approved: boolean,
  note: string
): Promise<void> {
  const [requester, organisation] = await Promise.all([
    change.requestedByUserId
      ? db.user.findUnique({
          where: { id: change.requestedByUserId },
          select: { email: true, name: true },
        })
      : null,
    db.organisation.findUnique({
      where: { id: change.organisationId },
      select: { name: true },
    }),
  ]);

  await sendQuietly(
    accountChangeDecided({
      to: requester?.email ?? "",
      contactName: requester?.name ?? change.requestedByName,
      organisationName: organisation?.name ?? "your account",
      summary: change.summary,
      approved,
      decidedAt: new Date(),
      decisionNote: note.trim() || null,
      theirReason: change.reason,
    }),
    {
      entity: "AccountChange",
      entityId: change.id,
      // A change is decided once, so this can only ever go out once.
      dedupeKey: `AccountChangeDecided:${change.id}`,
    }
  );
}

/** Turning a request down. The note is required — "no" needs a reason. */
export async function rejectChange(
  changeId: string,
  note: string
): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin) return fail("Only an administrator can decide a change.");

  const clean = note.trim().replace(/\s+/g, " ");
  if (clean.length < 5) {
    return fail("Say why this is not being approved — the customer sees it.");
  }

  const change = await db.accountChange.findUnique({ where: { id: changeId } });
  if (!change) return fail("That change no longer exists.");
  if (change.status !== "Pending") {
    return fail(`That change has already been ${change.status.toLowerCase()}.`);
  }

  await db.$transaction(async (tx) => {
    await tx.accountChange.update({
      where: { id: changeId },
      data: {
        status: "Rejected",
        // Kept: a customer looking at a refusal should be able to see what
        // they asked for, not just that it was refused.
        reviewedByUserId: admin.id,
        reviewedByName: admin.name,
        reviewedAt: new Date(),
        decisionNote: clean,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        action: "AccountChangeRejected",
        entity: "AccountChange",
        entityId: changeId,
        after: JSON.stringify({ kind: change.kind, note: clean }),
      },
    });
  });

  await tellTheCustomer(change, false, clean);
  return ok(undefined);
}

/** A customer withdrawing their own request before anyone has looked at it. */
export async function withdrawChange(
  changeId: string,
  organisationId: string
): Promise<Result> {
  const change = await db.accountChange.findFirst({
    where: { id: changeId, organisationId, status: "Pending" },
  });
  if (!change) return fail("That request is not waiting for approval.");

  await db.accountChange.delete({ where: { id: changeId } });
  return ok(undefined);
}
