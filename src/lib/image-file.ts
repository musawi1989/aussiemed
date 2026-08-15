import { randomBytes } from "node:crypto";

/**
 * What counts as an acceptable image, and what to call it once stored.
 *
 * Pure and free of any storage concern, so it can be unit tested without a
 * filesystem — the same split as query.ts against catalog.ts. src/lib/storage.ts
 * is the only caller and adds the I/O.
 */

/** 5 MB. Larger than any product photograph needs to be, small enough that a
 *  mistaken upload of a RAW file is refused rather than stored. Keep in step
 *  with serverActions.bodySizeLimit in next.config.ts, which must be a little
 *  higher to allow for multipart overhead. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Accepted image types, identified by their leading bytes rather than by the
 * filename or the browser's Content-Type — both are supplied by the caller and
 * neither is evidence. This is not hypothetical here: four seed products were
 * SVG placeholders saved with a .jpg extension, and the image optimiser
 * rejected them with a 400 at request time (DA-25). Checking the bytes turns
 * that into a refusal at upload time, with a reason.
 *
 * SVG is deliberately absent. It is a document that can carry script, and it
 * would be served from our own origin.
 */
const SIGNATURES: { ext: string; mime: string; match: (b: Buffer) => boolean }[] = [
  {
    ext: "jpg",
    mime: "image/jpeg",
    match: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    mime: "image/png",
    match: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: "gif",
    mime: "image/gif",
    match: (b) => b.subarray(0, 3).toString("latin1") === "GIF",
  },
  {
    ext: "webp",
    mime: "image/webp",
    match: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    ext: "avif",
    mime: "image/avif",
    // ....ftypavif — the brand sits at byte 8, after the box length.
    match: (b) =>
      b.subarray(4, 8).toString("latin1") === "ftyp" &&
      b.subarray(8, 12).toString("latin1").startsWith("avi"),
  },
];

export type DetectedImage = { ext: string; mime: string };

/** The image type these bytes actually are, or null if they are not an image. */
export function detectImage(bytes: Buffer): DetectedImage | null {
  if (bytes.length < 12) return null;
  const found = SIGNATURES.find((s) => s.match(bytes));
  return found ? { ext: found.ext, mime: found.mime } : null;
}

export type ImageCheck =
  | { ok: true; ext: string; mime: string }
  | { ok: false; error: string };

/** Everything that can be decided from the bytes alone. */
export function checkImage(bytes: Buffer): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: "That file is empty" };

  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `That image is ${mb} MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    };
  }

  const detected = detectImage(bytes);
  if (!detected) {
    return {
      ok: false,
      error:
        "That file is not a JPEG, PNG, GIF, WebP or AVIF image. A file renamed to .jpg is still not one — see DA-25.",
    };
  }

  return { ok: true, ext: detected.ext, mime: detected.mime };
}

/**
 * A storage key that cannot collide and cannot be steered by the uploader.
 *
 * The original filename is not reused. It is attacker-controlled input that
 * would end up as a path segment, and two people uploading "product.jpg" would
 * silently overwrite one another. The slug is included only so a human listing
 * the directory can tell what they are looking at.
 */
export function imageKey(slug: string, ext: string): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${safeSlug || "product"}-${randomBytes(8).toString("hex")}.${ext}`;
}
