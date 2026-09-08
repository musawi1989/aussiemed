import "server-only";

import { db } from "./db";
import { audit, requireAdmin, type Result } from "./admin";
import { safeDisplayName } from "./document-file";
import {
  putPrivateDocument,
  readPrivateDocument,
  removePrivateDocument,
} from "./storage";

/**
 * The TRN certificate held against a supplier or a customer account.
 *
 * WHY KEEP THE DOCUMENT AT ALL. The number alone is somebody's typing. A wrong
 * TRN on a tax invoice is worse than none (the customer form has said so since
 * FN-19), and the only way to check one is against the certificate it came
 * from. Holding the document turns "is this right" from a phone call into a
 * click.
 *
 * ⚠ THESE ARE PRIVATE AND ARE NOT SERVED FROM public/. A tax certificate is
 * paperwork given to us for our records; a guessable URL on our own domain is
 * not where it belongs. The bytes live in a private store and what is recorded
 * on the row is a storage KEY, never a URL — there is no address to leak
 * because there is no address. Reading one goes through readTrnDocument below,
 * which requires an admin, and the route above it does too. Both check: a
 * route that trusted this function, or a function that trusted its route,
 * would be one edit away from being wrong.
 *
 * ONE DOCUMENT PER RECORD, replaced rather than versioned. A certificate is
 * reissued, not amended, and a history of superseded tax documents is a
 * retention question nobody has asked for. Replacing deletes the old bytes.
 */

/** The two things that can hold one. Not a free string — see resolve(). */
export type TrnHolder = "supplier" | "customer";

export type TrnDocumentInfo = {
  name: string;
  uploadedAt: Date;
};

const fail = (error: string): Result<never> => ({ ok: false, error });

/**
 * Which table, and what to call it.
 *
 * A closed map rather than a string interpolated into a query. The holder kind
 * arrives from a URL segment, and `db[kind]` would let that segment choose the
 * table — including tables that have nothing to do with tax documents.
 */
const HOLDERS = {
  supplier: {
    entity: "Supplier",
    label: "supplier",
    find: (id: string) =>
      db.supplier.findUnique({
        where: { id },
        select: {
          companyName: true,
          trnDocumentKey: true,
          trnDocumentName: true,
          trnDocumentUploadedAt: true,
        },
      }),
    update: (id: string, data: Record<string, unknown>) =>
      db.supplier.update({ where: { id }, data }),
  },
  customer: {
    entity: "Organisation",
    label: "account",
    find: (id: string) =>
      db.organisation.findUnique({
        where: { id },
        select: {
          name: true,
          trnDocumentKey: true,
          trnDocumentName: true,
          trnDocumentUploadedAt: true,
        },
      }),
    update: (id: string, data: Record<string, unknown>) =>
      db.organisation.update({ where: { id }, data }),
  },
} as const;

/** The record and what it is called, or null. */
async function load(kind: TrnHolder, id: string) {
  const holder = HOLDERS[kind];
  const row = await holder.find(id);
  if (!row) return null;
  return {
    holder,
    name: "companyName" in row ? row.companyName : row.name,
    key: row.trnDocumentKey,
    fileName: row.trnDocumentName,
    uploadedAt: row.trnDocumentUploadedAt,
  };
}

/** True for a value that came off a URL and might be anything. */
export function isTrnHolder(value: string): value is TrnHolder {
  return value === "supplier" || value === "customer";
}

/**
 * Store a certificate against a record, replacing any it already had.
 *
 * The bytes are validated in document-file.ts before anything is written, so
 * a file renamed to .pdf is refused here rather than discovered by whoever
 * opens it in six months.
 */
export async function putTrnDocument(
  kind: TrnHolder,
  id: string,
  file: { name: string; bytes: Buffer },
): Promise<Result> {
  const actor = await requireAdmin(kind === "supplier" ? "suppliers" : "customers");

  const record = await load(kind, id);
  if (!record) return fail(`That ${HOLDERS[kind].label} no longer exists.`);

  const stored = await putPrivateDocument(file.bytes, record.name);
  if (!stored.ok) return fail(stored.error);

  // The fallback extension comes off the stored key, which carries the type
  // the bytes actually turned out to be — so a PNG whose name was unusable
  // does not end up called document.pdf.
  const displayName = safeDisplayName(
    file.name,
    stored.url.split(".").pop() ?? "pdf",
  );

  await record.holder.update(id, {
    trnDocumentKey: stored.url,
    trnDocumentName: displayName,
    trnDocumentUploadedAt: new Date(),
  });

  /*
   * The old bytes go only AFTER the row points at the new ones.
   *
   * The other order leaves a window where the row names a file that is already
   * gone, and if the update then fails the record has lost its document with
   * nothing to show for it. This way the worst case is an orphaned file on
   * disk, which costs a few kilobytes and nothing else.
   */
  if (record.key) await removePrivateDocument(record.key);

  await audit(
    actor,
    "trnDocument.upload",
    record.holder.entity,
    id,
    record.fileName,
    displayName,
  );

  return { ok: true, value: undefined };
}

/** Take the certificate off a record, and delete the bytes. */
export async function removeTrnDocument(
  kind: TrnHolder,
  id: string,
): Promise<Result> {
  const actor = await requireAdmin(kind === "supplier" ? "suppliers" : "customers");

  const record = await load(kind, id);
  if (!record) return fail(`That ${HOLDERS[kind].label} no longer exists.`);
  if (!record.key) return fail("There is no document to remove.");

  await record.holder.update(id, {
    trnDocumentKey: null,
    trnDocumentName: null,
    trnDocumentUploadedAt: null,
  });

  await removePrivateDocument(record.key);
  await audit(
    actor,
    "trnDocument.remove",
    record.holder.entity,
    id,
    record.fileName,
    null,
  );

  return { ok: true, value: undefined };
}

/**
 * The document's bytes and name, for an admin.
 *
 * Requires an admin here as well as in the route that calls it. Two checks for
 * one document looks redundant until somebody adds a second caller.
 */
export async function readTrnDocument(
  kind: TrnHolder,
  id: string,
): Promise<{ bytes: Buffer; name: string } | null> {
  await requireAdmin(kind === "supplier" ? "suppliers" : "customers", "view");

  const record = await load(kind, id);
  if (!record?.key) return null;

  const bytes = await readPrivateDocument(record.key);
  if (!bytes) return null;

  return { bytes, name: record.fileName ?? "trn-certificate" };
}
