import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { composeEmailMime } from "./email-mime";
import { emailHtmlFromText, safeEmailHtml, validateAttachments } from "./email-html";

import { db } from "./db";
import {
  AUDIENCE,
  FROM_ADDRESS,
  isSendableAddress,
  type EmailMessage,
} from "./email-message";

/**
 * How an email actually leaves.
 *
 * A seam, like storage.ts, and for the same reason: hosting is IN-01 and
 * undecided, and no SMTP provider has been chosen. Rather than guess at one
 * and write it through the application, everything that could touch a network
 * is confined here. Adding Postmark, SES or plain SMTP means writing one more
 * driver and setting MAIL_DRIVER; no calling code changes.
 *
 * What the rest of the application sees is `send(message)`, which always
 * records what it did. That is the point. Until now quote requests, restock
 * requests and enquiries were stored and never sent, and nothing anywhere said
 * so — the failure was silent, which is the only kind that lasts. A row is
 * written before delivery is attempted, so a message that never goes out still
 * leaves evidence that it should have.
 *
 * The wording itself lives in email-message.ts, which is pure and tested, so a
 * second driver cannot change what a customer reads.
 */

export type SendOutcome = {
  id: string;
  status: "Sent" | "Failed" | "Suppressed" | "Duplicate";
  error?: string;
};

type Driver = {
  name: string;
  deliver: (message: EmailMessage) => Promise<void>;
};

/* ------------------------------------------------------------------ *
 * Drivers
 * ------------------------------------------------------------------ */

/**
 * The default. Writes a readable .eml beside the repo instead of sending.
 *
 * Right for a laptop and right for a demo: everything the customer would have
 * received can be opened and read, and nothing escapes to a real inbox while
 * the catalogue is still seeded test data. `/outbox/` is gitignored.
 */
const outboxDriver: Driver = {
  name: "outbox",
  async deliver(message) {
    const root = resolve(process.cwd(), "outbox");
    await mkdir(root, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeKind = message.kind.replace(/[^A-Za-z0-9]/g, "");
    const file = join(root, `${stamp}-${safeKind}-${randomUUID()}.eml`);

    const eml = await composeEmailMime(message, FROM_ADDRESS);
    await writeFile(file, eml);
  },
};

/** For a container with no writable disk: the log is the delivery record. */
const logDriver: Driver = {
  name: "log",
  async deliver(message) {
    console.log(
      `[mail] to=${message.to} kind=${message.kind} subject=${message.subject}`
    );
  },
};

/**
 * Fails loudly rather than quietly doing nothing.
 *
 * A driver that accepted everything and delivered nothing would recreate the
 * exact bug this feature exists to fix, except harder to see because the row
 * would say Sent.
 */
const unconfiguredSmtp: Driver = {
  name: "smtp",
  async deliver() {
    throw new Error(
      "MAIL_DRIVER=smtp, but no SMTP transport is wired up yet. " +
        "Add one here and keep the driver interface — nothing else changes."
    );
  },
};

const DRIVERS: Record<string, Driver> = {
  outbox: outboxDriver,
  log: logDriver,
  smtp: unconfiguredSmtp,
};

function driver(): Driver {
  const name = (process.env.MAIL_DRIVER ?? "outbox").trim().toLowerCase();
  return DRIVERS[name] ?? outboxDriver;
}

export function mailDriverName(): string {
  return driver().name;
}

/* ------------------------------------------------------------------ *
 * Sending
 * ------------------------------------------------------------------ */

export type SendOptions = {
  senderUserId?: string;
  subjectPrefix?: string;
  /** What this is about, so the admin screen can link back. */
  entity?: string;
  entityId?: string;
  /**
   * Makes the send idempotent. Unique in the database, so two concurrent
   * callers cannot both get past a check-then-insert.
   */
  dedupeKey?: string;
};

/**
 * Records the message, then tries to deliver it.
 *
 * Never throws. A checkout that succeeded must not be reported as failed
 * because a mailbox was full, and a purchase order that has been sent to a
 * supplier is still sent if the confirmation email bounces. Everything that
 * goes wrong is recorded on the row and surfaced on /admin/emails.
 */
export async function send(
  original: EmailMessage,
  options: SendOptions = {}
): Promise<SendOutcome> {
  /**
   * The admin's own wording, if they have written any — see
   * message-templates.ts.
   *
   * APPLIED HERE, ONCE, rather than at each call site. Every automatic message
   * in the application goes through this function, so this is the only place
   * that has to be right; a hook per caller would be a hook somebody forgets on
   * the next message they add, and the failure mode is silent.
   *
   * It is applied BEFORE the row is written, so what is recorded on
   * /admin/emails is what actually went out. Recording the built-in text and
   * sending the override would make the trail a record of what we meant.
   *
   * Imported lazily to keep this module's own import graph free of the
   * database layer, and because a mailer that cannot be loaded without a
   * template table is a mailer that stops working the moment one is missing.
   */
  const { applyTemplate } = await import("./message-templates");
  const message = await applyTemplate(original);
  if (/[\r\n]/.test(message.subject) || message.subject.length > 998) return { id: "", status: "Failed", error: "Use a single-line subject under 998 characters." };
  const attachmentError = validateAttachments(message.attachments ?? []);
  if (attachmentError) return { id: "", status: "Failed", error: attachmentError };
  const signature = options.senderUserId ? await db.user.findUnique({ where: { id: options.senderUserId }, select: { emailSignatureHtml: true } }) : null;
  message.html = safeEmailHtml(message.html || emailHtmlFromText(message.text));
  if (signature?.emailSignatureHtml) message.html += `<hr>${safeEmailHtml(signature.emailSignatureHtml)}`;
  if (options.subjectPrefix) message.subject = `${options.subjectPrefix.replace(/[\r\n]/g, " ")}${message.subject}`;

  const audience = AUDIENCE[message.kind];
  const chosen = driver();

  // An address we would not send to is recorded, not discarded. A customer who
  // never gets their confirmation because we hold a typo should be findable.
  if (!isSendableAddress(message.to)) {
    const row = await create(message, audience, chosen.name, options, {
      status: "Suppressed",
      error: message.to?.trim()
        ? `Not a sendable address: ${message.to}`
        : "No address on record",
    });
    return { id: row.id, status: "Suppressed", error: row.error ?? undefined };
  }

  let row;
  try {
    row = await create(message, audience, chosen.name, options, {
      status: "Queued",
    });
  } catch (error) {
    // The unique dedupeKey did its job: this exact message already exists.
    if (options.dedupeKey) {
      const existing = await db.outboundEmail.findUnique({
        where: { dedupeKey: options.dedupeKey },
      });
      if (existing) return existing.status === "Sent"
        ? { id: existing.id, status: "Duplicate" }
        : { id: existing.id, status: existing.status === "Suppressed" ? "Suppressed" : "Failed", error: existing.error ?? "This message is queued or failed. Retry it from Email." };
    }
    throw error;
  }

  return deliver(row.id);
}

async function create(
  message: EmailMessage,
  audience: string,
  driverName: string,
  options: SendOptions,
  state: { status: string; error?: string }
) {
  return db.outboundEmail.create({
    data: {
      kind: message.kind,
      audience,
      toAddress: (message.to ?? "").trim(),
      subject: message.subject,
      body: message.text,
      html: message.html ?? null,
      attachments: { create: (message.attachments ?? []).map(file => ({ fileName: file.fileName, contentType: file.contentType, bytes: new Uint8Array(file.bytes) })) },
      status: state.status,
      driver: driverName,
      error: state.error ?? null,
      entity: options.entity ?? null,
      entityId: options.entityId ?? null,
      dedupeKey: options.dedupeKey ?? null,
    },
  });
}

/**
 * Attempts one queued or failed message. Also what the retry button calls, so
 * a retry goes down exactly the same path as the first try.
 */
export async function deliver(id: string): Promise<SendOutcome> {
  const row = await db.outboundEmail.findUnique({ where: { id }, include: { attachments: true } });
  if (!row) return { id, status: "Failed", error: "No such message" };
  if (row.status === "Sent") return { id, status: "Duplicate" };
  if (row.status === "Suppressed" || !isSendableAddress(row.toAddress)) return { id, status: "Suppressed", error: "This recipient is not enabled for delivery." };

  const chosen = driver();

  try {
    await chosen.deliver({
      kind: row.kind as EmailMessage["kind"],
      to: row.toAddress,
      subject: row.subject,
      text: row.body,
      html: row.html ?? undefined,
      attachments: row.attachments.map(file => ({ fileName: file.fileName, contentType: file.contentType, bytes: file.bytes })),
    });

    await db.outboundEmail.update({
      where: { id },
      data: {
        status: "Sent",
        driver: chosen.name,
        sentAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });
    return { id, status: "Sent" };
  } catch (error) {
    const detail = (error as Error).message.slice(0, 500);
    await db.outboundEmail.update({
      where: { id },
      data: {
        status: "Failed",
        driver: chosen.name,
        attempts: { increment: 1 },
        error: detail,
      },
    });
    return { id, status: "Failed", error: detail };
  }
}

/**
 * Sends without ever letting the caller fail.
 *
 * For the places where the email is a consequence of the real work rather than
 * the work itself: an order has been placed, a purchase order has been sent.
 * Those must not be rolled back because the mail step threw.
 */
export async function sendQuietly(
  message: EmailMessage,
  options: SendOptions = {}
): Promise<void> {
  try {
    await send(message, options);
  } catch (error) {
    console.error("[mail] could not record a message:", error);
  }
}
