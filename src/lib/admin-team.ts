import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { getSessionUser, hashPassword } from "./auth";
import {
  ADMIN_PERMISSION_KEYS,
  canReach,
  deniedFrom,
  findAdminPermission,
} from "./admin-permissions";

/**
 * The admin team, and who is allowed to do what.
 *
 * WHAT THE CLIENT ASKED FOR: more than one person in the back office, with one
 * master admin in full control of what the others can see and do. Per-account
 * toggles rather than named roles, which was their choice when asked — it is
 * the most direct answer to "control what they can and can't do" and there is
 * no second concept to learn.
 *
 * THREE RULES THAT ARE ENFORCED HERE RATHER THAN ASSUMED, because each one is a
 * way to lock everybody out permanently:
 *
 *   1. Only a master admin may manage the team. A plain admin cannot grant
 *      themselves anything, including mastery.
 *   2. The last master admin cannot be demoted, disabled or deleted. A
 *      permission console nobody can open is a bricked system.
 *   3. Nobody can change their own permissions or their own mastery. Not
 *      because a master would deny themselves on purpose, but because the
 *      screen that lets them is the screen that lets them do it by accident.
 *
 * Permissions are stored as DENIALS — see admin-permissions.ts for why that
 * direction, and note that a master admin's rows are meaningless: they hold
 * everything regardless, which is checked in canReach and tested there.
 */

/* ------------------------------------------------------------------ *
 * Passwords
 * ------------------------------------------------------------------ */

/*
 * hashPassword comes from auth.ts, which is the only file that knows the
 * format — scrypt$salt$hash, self-describing so it can be changed later.
 *
 * IT WAS BRIEFLY REIMPLEMENTED HERE and got the format subtly wrong: the same
 * algorithm, a different encoding. Everything looked right — the account was
 * created, the row had a hash, the screen said so — and the person simply could
 * not sign in. There is exactly one correct answer to "how is a password
 * stored" and it belongs in one place.
 */

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export type AdminAccount = {
  id: string;
  name: string;
  username: string | null;
  email: string;
  isMasterAdmin: boolean;
  isDisabled: boolean;
  createdAt: Date;
  /** Sections they may not reach. */
  denied: string[];
  /** True for the person looking at the screen. */
  isYou: boolean;
};

/** Who is signed in, and what they may reach. Null when nobody is. */
export async function currentAdmin(): Promise<{
  id: string;
  name: string;
  isMaster: boolean;
  denied: string[];
} | null> {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") return null;

  const [row, denials] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { isMasterAdmin: true },
    }),
    db.adminPermission.findMany({ where: { userId: user.id }, select: { key: true } }),
  ]);

  return {
    id: user.id,
    name: user.name,
    isMaster: Boolean(row?.isMasterAdmin),
    denied: deniedFrom(denials),
  };
}

/**
 * Whether the signed-in admin may reach a path.
 *
 * Used by the layout to decide what to draw and by the guard below to decide
 * what to serve. Both, deliberately: hiding a link is a courtesy, and refusing
 * the request is the actual control.
 */
export async function mayReach(pathname: string): Promise<boolean> {
  const me = await currentAdmin();
  if (!me) return false;
  return canReach(pathname, { isMaster: me.isMaster, denied: me.denied });
}

/**
 * Refuses a request for a section this admin does not hold.
 *
 * THROWS, like requireAdmin, and for the same reason: a page that could carry
 * on by ignoring a return value will eventually be written by somebody who
 * does.
 */
export async function requireSection(pathname: string): Promise<void> {
  await requireAdmin();
  if (!(await mayReach(pathname))) {
    throw new Error(`Not permitted: ${pathname}`);
  }
}

/** Every admin account, for the master admin's console. */
export async function listAdmins(): Promise<AdminAccount[]> {
  const me = await requireMaster();
  if (!me.ok) return [];

  const users = await db.user.findMany({
    where: { role: "Admin" },
    orderBy: [{ isMasterAdmin: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      isMasterAdmin: true,
      isDisabled: true,
      createdAt: true,
      adminDenials: { select: { key: true } },
    },
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    isMasterAdmin: user.isMasterAdmin,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    denied: deniedFrom(user.adminDenials),
    isYou: user.id === me.value.id,
  }));
}

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

/** The signed-in master admin, carried whole so audit() gets a real actor. */
type Me = Awaited<ReturnType<typeof requireAdmin>>;

async function requireMaster(): Promise<Result<Me>> {
  const actor = await requireAdmin();
  const row = await db.user.findUnique({
    where: { id: actor.id },
    select: { isMasterAdmin: true },
  });

  if (!row?.isMasterAdmin) {
    return {
      ok: false,
      error: "Only the master admin can manage the team.",
    };
  }
  return { ok: true, value: actor };
}

/** How many master admins would be left if this one stopped being one. */
async function mastersOtherThan(userId: string): Promise<number> {
  return db.user.count({
    where: {
      role: "Admin",
      isMasterAdmin: true,
      isDisabled: false,
      id: { not: userId },
    },
  });
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

const MIN_PASSWORD = 8;

export async function createAdmin(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  isMasterAdmin: boolean;
}): Promise<Result<{ id: string }>> {
  const me = await requireMaster();
  if (!me.ok) return me;

  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: "Give them a name." };
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return {
      ok: false,
      error:
        "A username is 3 to 32 characters: letters, numbers, dot, dash or underscore.",
    };
  }
  if (!email.includes("@")) {
    return { ok: false, error: "That does not look like an email address." };
  }
  if (input.password.length < MIN_PASSWORD) {
    return {
      ok: false,
      error: `A password needs at least ${MIN_PASSWORD} characters.`,
    };
  }

  const clash = await db.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { username: true, email: true },
  });
  if (clash) {
    return {
      ok: false,
      error:
        clash.username === username
          ? `Somebody already signs in as "${username}".`
          : `${email} is already on an account.`,
    };
  }

  const created = await db.user.create({
    data: {
      name,
      username,
      email,
      role: "Admin",
      passwordHash: await hashPassword(input.password),
      // An account made by the master admin is not an application: it is
      // verified and approved by the act of creating it.
      isVerified: true,
      approvalStatus: "Approved",
      approvedAt: new Date(),
      approvedBy: me.value.name,
      isMasterAdmin: input.isMasterAdmin,
    },
    select: { id: true },
  });

  await audit(
    me.value,
    "admin.create",
    "User",
    username,
    null,
    { name, username, email, isMasterAdmin: input.isMasterAdmin }
  );

  return { ok: true, value: { id: created.id } };
}

/**
 * Sets exactly which sections an admin may not reach.
 *
 * Takes the whole list rather than one toggle at a time, so the screen and the
 * database agree on a complete answer — a per-toggle endpoint drifts the moment
 * two of them race.
 */
export async function setAdminPermissions(
  userId: string,
  denied: string[]
): Promise<Result<{ denied: string[] }>> {
  const me = await requireMaster();
  if (!me.ok) return me;

  if (userId === me.value.id) {
    return {
      ok: false,
      error:
        "You cannot change your own permissions. Ask another master admin, so nobody can shut themselves out by accident.",
    };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, role: true, isMasterAdmin: true },
  });
  if (!target || target.role !== "Admin") {
    return { ok: false, error: "That is not an admin account." };
  }
  if (target.isMasterAdmin) {
    return {
      ok: false,
      error:
        "A master admin holds everything. Take mastery away first if they should be limited.",
    };
  }

  const keys = [...new Set(denied)].filter((key) =>
    ADMIN_PERMISSION_KEYS.includes(key)
  );

  const before = await db.adminPermission.findMany({
    where: { userId },
    select: { key: true },
  });

  await db.$transaction([
    db.adminPermission.deleteMany({ where: { userId } }),
    db.adminPermission.createMany({
      data: keys.map((key) => ({
        userId,
        key,
        createdByName: me.value.name,
      })),
    }),
  ]);

  await audit(
    me.value,
    "admin.permissions",
    "User",
    target.username ?? target.name,
    { denied: deniedFrom(before).map((k) => findAdminPermission(k)?.label ?? k) },
    { denied: keys.map((k) => findAdminPermission(k)?.label ?? k) }
  );

  return { ok: true, value: { denied: keys } };
}

export async function setMasterAdmin(
  userId: string,
  isMaster: boolean
): Promise<Result> {
  const me = await requireMaster();
  if (!me.ok) return me;

  if (userId === me.value.id) {
    return {
      ok: false,
      error:
        "You cannot change your own status. Another master admin has to do it, which is what stops the last one stepping down by accident.",
    };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, role: true, isMasterAdmin: true },
  });
  if (!target || target.role !== "Admin") {
    return { ok: false, error: "That is not an admin account." };
  }
  if (target.isMasterAdmin === isMaster) {
    return { ok: false, error: "Nothing to change." };
  }

  if (!isMaster && (await mastersOtherThan(userId)) === 0) {
    return {
      ok: false,
      error:
        "This is the only master admin. Make somebody else one first — a system with no master admin has nobody who can grant permissions.",
    };
  }

  await db.user.update({ where: { id: userId }, data: { isMasterAdmin: isMaster } });

  // Mastery outranks every denial, so a stale set left behind would come back
  // to life the day somebody stops being master. Cleared on the way in.
  if (isMaster) {
    await db.adminPermission.deleteMany({ where: { userId } });
  }

  await audit(
    me.value,
    isMaster ? "admin.master.grant" : "admin.master.revoke",
    "User",
    target.username ?? target.name,
    { isMasterAdmin: target.isMasterAdmin },
    { isMasterAdmin: isMaster }
  );

  return { ok: true, value: undefined };
}

export async function setAdminDisabled(
  userId: string,
  isDisabled: boolean
): Promise<Result> {
  const me = await requireMaster();
  if (!me.ok) return me;

  if (userId === me.value.id) {
    return { ok: false, error: "You cannot disable your own account." };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true, role: true, isMasterAdmin: true, isDisabled: true },
  });
  if (!target || target.role !== "Admin") {
    return { ok: false, error: "That is not an admin account." };
  }

  if (isDisabled && target.isMasterAdmin && (await mastersOtherThan(userId)) === 0) {
    return {
      ok: false,
      error:
        "This is the only master admin. Disabling them would leave nobody who can grant permissions.",
    };
  }

  await db.user.update({ where: { id: userId }, data: { isDisabled } });

  await audit(
    me.value,
    isDisabled ? "admin.disable" : "admin.enable",
    "User",
    target.username ?? target.name,
    { isDisabled: target.isDisabled },
    { isDisabled }
  );

  return { ok: true, value: undefined };
}

export async function resetAdminPassword(
  userId: string,
  password: string
): Promise<Result> {
  const me = await requireMaster();
  if (!me.ok) return me;

  if (password.length < MIN_PASSWORD) {
    return {
      ok: false,
      error: `A password needs at least ${MIN_PASSWORD} characters.`,
    };
  }

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, username: true, role: true },
  });
  if (!target || target.role !== "Admin") {
    return { ok: false, error: "That is not an admin account." };
  }

  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password) },
  });

  // Every session they hold, gone. A password reset that leaves the old
  // sessions alive has not taken the account back from anybody.
  await db.session.deleteMany({ where: { userId } });

  await audit(
    me.value,
    "admin.password.reset",
    "User",
    target.username ?? target.name,
    null,
    // Never the password, obviously. What is worth recording is that it
    // happened, to whom, and that it signed them out.
    { sessionsEnded: true }
  );

  return { ok: true, value: undefined };
}
