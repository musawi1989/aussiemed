import "server-only";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { readFile } from "node:fs/promises";

import { checkImage, imageKey } from "./image-file";
import { checkDocument, documentKey } from "./document-file";

/**
 * Where uploaded files live.
 *
 * This is a seam, not an abstraction for its own sake. Local disk is the only
 * driver today and is right for a laptop, but it does not survive most
 * deployments — a container filesystem is discarded on every deploy, and two
 * instances behind a load balancer do not share one. Hosting is IN-01 and has
 * not been chosen, so rather than guess, everything that touches a filesystem
 * is confined here. Adding S3, R2 or Blob storage means writing one more
 * driver and setting STORAGE_DRIVER; no calling code changes.
 *
 * The rest of the application only ever sees the public URL that comes back.
 * What counts as an acceptable image is decided in image-file.ts, which is
 * pure and unit tested, so a second driver cannot accept what this one refuses.
 *
 * ⚠ TWO STORES, AND THE DIFFERENCE MATTERS. Product images go in public/,
 * where Next serves them straight off disk to anybody with the URL — correct,
 * since a catalogue photograph is meant to be seen. DOCUMENTS DO NOT. A TRN
 * certificate is somebody's tax paperwork, given to us for our records, and a
 * guessable URL on our own domain is not where it belongs. Those go to a
 * private root outside public/ and are readable only through an
 * admin-authenticated route that fetches them by id. There is no URL to leak,
 * because there is no URL.
 */

export type StorageResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export { MAX_IMAGE_BYTES } from "./image-file";

/* ------------------------------------------------------------------ *
 * Local disk driver
 * ------------------------------------------------------------------ */

/** Served by Next straight out of public/, so the URL mirrors the path. */
const PUBLIC_PREFIX = "/uploads/products";

function localRoot(): string {
  return resolve(process.cwd(), "public", "uploads", "products");
}

async function putLocal(key: string, bytes: Buffer): Promise<StorageResult> {
  const target = join(localRoot(), key);

  // Belt and braces: the key is generated, never supplied, but a traversal
  // here would write anywhere on the disk the server can reach.
  if (!resolve(target).startsWith(localRoot())) {
    return { ok: false, error: "Refusing to write outside the uploads folder" };
  }

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { ok: true, url: `${PUBLIC_PREFIX}/${key}` };
  } catch (error) {
    return {
      ok: false,
      error: `Could not save the file: ${(error as Error).message}`,
    };
  }
}

async function deleteLocal(url: string): Promise<void> {
  // Only ever removes something we put there. Seed photography and theme
  // assets live elsewhere in public/ and must survive an image being removed
  // from a product — the row goes, the file does not.
  if (!url.startsWith(`${PUBLIC_PREFIX}/`)) return;

  const key = url.slice(PUBLIC_PREFIX.length + 1);
  const target = join(localRoot(), key);
  if (!resolve(target).startsWith(localRoot())) return;

  // A missing file is the desired end state, not an error worth surfacing.
  await unlink(target).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Public document store — catalogue paperwork, under public/
 * ------------------------------------------------------------------ */

/**
 * A THIRD store, and the reason it is not the private one.
 *
 * A safety data sheet is the opposite of a TRN certificate. The manufacturer
 * publishes it, a laboratory buyer is frequently required to hold one before
 * the goods arrive, and making somebody sign in to read it would be a
 * compliance obstacle we invented ourselves. So product paperwork is served
 * straight off disk, like a photograph.
 *
 * It sits in its own folder rather than beside the images because the two are
 * emptied and migrated on different terms — the seed photography goes when the
 * real catalogue lands (DA-03), the paperwork does not — and because a
 * directory that mixes glove photographs with safety data sheets is harder for
 * a human to audit.
 *
 * What may be uploaded is still decided by document-file.ts, so a PDF is
 * accepted here and refused as a product image, and neither can be steered by
 * renaming a file.
 */
const PUBLIC_DOCUMENT_PREFIX = "/uploads/documents";

function localDocumentRoot(): string {
  return resolve(process.cwd(), "public", "uploads", "documents");
}

async function putPublicDocumentLocal(
  key: string,
  bytes: Buffer
): Promise<StorageResult> {
  const target = join(localDocumentRoot(), key);

  // Belt and braces: the key is generated, never supplied, but a traversal
  // here would write anywhere on the disk the server can reach.
  if (!resolve(target).startsWith(localDocumentRoot())) {
    return { ok: false, error: "Refusing to write outside the document folder" };
  }

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { ok: true, url: `${PUBLIC_DOCUMENT_PREFIX}/${key}` };
  } catch (error) {
    return {
      ok: false,
      error: `Could not save the file: ${(error as Error).message}`,
    };
  }
}

async function deletePublicDocumentLocal(url: string): Promise<void> {
  // Only ever removes something we put there, on the same reasoning as the
  // images: a document referenced from elsewhere in public/ keeps its file
  // when the row goes.
  if (!url.startsWith(`${PUBLIC_DOCUMENT_PREFIX}/`)) return;

  const target = join(
    localDocumentRoot(),
    url.slice(PUBLIC_DOCUMENT_PREFIX.length + 1)
  );
  if (!resolve(target).startsWith(localDocumentRoot())) return;

  await unlink(target).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Private document store — NOT under public/
 * ------------------------------------------------------------------ */

/**
 * A key, not a URL.
 *
 * What is recorded on the row is the storage key alone. Nothing about it is
 * reachable over HTTP: reading one goes through an admin-only route that looks
 * the row up and streams the bytes. That is the whole point of the separation
 * — a private document with a public URL is a public document with an
 * inconvenient address.
 */
function privateRoot(): string {
  return resolve(process.cwd(), "storage", "documents");
}

async function putPrivateLocal(key: string, bytes: Buffer): Promise<StorageResult> {
  const target = join(privateRoot(), key);

  // Belt and braces: the key is generated, never supplied, but a traversal
  // here would write anywhere on the disk the server can reach.
  if (!resolve(target).startsWith(privateRoot())) {
    return { ok: false, error: "Refusing to write outside the document store" };
  }

  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    // The key, deliberately — see the note above.
    return { ok: true, url: key };
  } catch (error) {
    return {
      ok: false,
      error: `Could not save the file: ${(error as Error).message}`,
    };
  }
}

async function readPrivateLocal(key: string): Promise<Buffer | null> {
  const target = join(privateRoot(), key);
  // The same check on the way out. A key read back from the database is not
  // user input today, but a path traversal on read is how it stops being true.
  if (!resolve(target).startsWith(privateRoot())) return null;
  return readFile(target).catch(() => null);
}

async function deletePrivateLocal(key: string): Promise<void> {
  const target = join(privateRoot(), key);
  if (!resolve(target).startsWith(privateRoot())) return;
  // A missing file is the desired end state, not an error worth surfacing.
  await unlink(target).catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

type Driver = {
  put: (key: string, bytes: Buffer) => Promise<StorageResult>;
  remove: (url: string) => Promise<void>;
};

const DRIVERS: Record<string, Driver> = {
  local: { put: putLocal, remove: deleteLocal },
};

function driver(): Driver {
  const name = process.env.STORAGE_DRIVER ?? "local";
  const chosen = DRIVERS[name];
  if (!chosen) {
    throw new Error(
      `Unknown STORAGE_DRIVER "${name}". Available: ${Object.keys(DRIVERS).join(", ")}`
    );
  }
  return chosen;
}

/** Validates and stores one product image, returning the URL to record. */
export async function putProductImage(
  bytes: Buffer,
  slug: string
): Promise<StorageResult> {
  const checked = checkImage(bytes);
  if (!checked.ok) return { ok: false, error: checked.error };

  return driver().put(imageKey(slug, checked.ext), bytes);
}

/** Removes a stored object. Silently ignores anything we did not store. */
export async function removeStoredImage(url: string): Promise<void> {
  await driver().remove(url);
}

/**
 * Validates and stores one product document, returning the URL to record.
 *
 * A URL, unlike its private sibling below — a safety data sheet is meant to be
 * downloaded without asking anyone's permission. The label seeds the filename
 * so a directory listing is legible; it never becomes a path on its own.
 */
export async function putProductDocument(
  bytes: Buffer,
  label: string
): Promise<StorageResult> {
  const checked = checkDocument(bytes);
  if (!checked.ok) return { ok: false, error: checked.error };

  return putPublicDocumentLocal(documentKey(label, checked.ext), bytes);
}

/** Removes a stored product document. Ignores anything we did not store. */
export async function removeStoredDocument(url: string): Promise<void> {
  await deletePublicDocumentLocal(url);
}

export { MAX_DOCUMENT_BYTES, ACCEPTED_DOCUMENTS } from "./document-file";

/**
 * Validates and stores one private document, returning the KEY to record.
 *
 * Not a URL. See the note at the top: these are not served from public/, and
 * the only way back to the bytes is readPrivateDocument below, behind an
 * admin check.
 */
export async function putPrivateDocument(
  bytes: Buffer,
  label: string
): Promise<StorageResult> {
  const checked = checkDocument(bytes);
  if (!checked.ok) return { ok: false, error: checked.error };

  return putPrivateLocal(documentKey(label, checked.ext), bytes);
}

/** The bytes behind a stored key, or null if there are none. */
export async function readPrivateDocument(key: string): Promise<Buffer | null> {
  return readPrivateLocal(key);
}

/** Removes a stored document. A missing one is already the end state. */
export async function removePrivateDocument(key: string): Promise<void> {
  await deletePrivateLocal(key);
}
