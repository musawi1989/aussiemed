import "server-only";

import { db } from "./db";
import { requireAdmin } from "./admin";
import { forwarded, isSendableAddress } from "./email-message";
import { send } from "./mailer";
import { publicUrl } from "./public-url";

/**
 * The in-site inbox.
 *
 * Distinct from the Needs attention panel, which counts what is outstanding
 * right now and forgets everything else. This is a stream of things that
 * happened: an order arrived, a supplier acknowledged, an email bounced. Some
 * of it needs doing and some is only worth knowing, and a count that returns
 * to zero loses both.
 *
 * Writing one never throws. A notification is a courtesy to a person; failing
 * to record it must not fail the order that caused it.
 */

export type NotificationKind =
  | "OrderPlaced"
  | "AccountChangeRequested"
  | "EnquiryReceived"
  | "QuoteRequested"
  | "PurchaseOrderAcknowledged"
  | "EmailFailed";

export async function notify(input: {
  kind: NotificationKind;
  subject: string;
  body: string;
  href?: string | null;
  entity?: string | null;
  entityId?: string | null;
}): Promise<void> {
  try {
    // One notification per thing. A supplier clicking acknowledge twice, or a
    // retry that re-runs the same path, must not fill the inbox with copies.
    if (input.entity && input.entityId) {
      const existing = await db.notification.findFirst({
        where: {
          kind: input.kind,
          entity: input.entity,
          entityId: input.entityId,
        },
        select: { id: true },
      });
      if (existing) return;
    }

    await db.notification.create({
      data: {
        audience: "Admin",
        kind: input.kind,
        subject: input.subject,
        body: input.body,
        href: input.href ?? null,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (error) {
    console.error("[inbox] could not record a notification:", error);
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export async function inbox(options: { unreadOnly?: boolean } = {}) {
  await requireAdmin();

  return db.notification.findMany({
    where: {
      audience: "Admin",
      ...(options.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export type InboxItem = Awaited<ReturnType<typeof inbox>>[number];

export async function unreadCount(): Promise<number> {
  const user = await db.user.findFirst({ where: { role: "Admin" } });
  if (!user) return 0;
  return db.notification.count({ where: { audience: "Admin", readAt: null } });
}

/* ------------------------------------------------------------------ *
 * Acting on one
 * ------------------------------------------------------------------ */

export type Result<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export async function markRead(id: string, read: boolean): Promise<Result> {
  await requireAdmin();

  await db.notification.update({
    where: { id },
    data: { readAt: read ? new Date() : null },
  });
  return ok(undefined);
}

export async function markAllRead(): Promise<Result<number>> {
  await requireAdmin();

  const result = await db.notification.updateMany({
    where: { audience: "Admin", readAt: null },
    data: { readAt: new Date() },
  });
  return ok(result.count);
}

/**
 * Sends an inbox item on to somebody as an email.
 *
 * The wording goes out as written. The person forwarding it has read that text
 * and is vouching for it; regenerating it from the underlying data would mean
 * they approved one thing and the recipient received another.
 *
 * Reading it also marks it read — you have plainly dealt with it.
 */
export async function emailNotification(
  id: string,
  to: string,
  note: string
): Promise<Result<{ status: string }>> {
  await requireAdmin();

  const item = await db.notification.findUnique({ where: { id } });
  if (!item) return fail("That notification no longer exists.");

  const address = to.trim();
  if (!isSendableAddress(address)) {
    return fail("That does not look like an email address.");
  }

  const outcome = await send(
    forwarded({
      to: address,
      subject: item.subject,
      body: item.body,
      note,
      link: item.href ? `${publicUrl()}${item.href}` : null,
    }),
    {
      entity: "Notification",
      entityId: item.id,
      // Keyed on the address as well, so the same item can be sent to a second
      // person without the first send blocking it.
      dedupeKey: `Forwarded:${item.id}:${address}`,
    }
  );

  if (outcome.status === "Failed" || outcome.status === "Suppressed") {
    return fail(
      outcome.error ?? "It could not be sent — see Email for the reason."
    );
  }

  await db.notification.update({
    where: { id },
    data: {
      emailedAt: new Date(),
      emailedTo: address,
      outboundEmailId: outcome.id,
      readAt: item.readAt ?? new Date(),
    },
  });

  return ok({ status: outcome.status });
}
