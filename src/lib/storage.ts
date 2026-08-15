import "server-only";

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { checkImage, imageKey } from "./image-file";

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
