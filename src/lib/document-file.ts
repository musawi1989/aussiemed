import { randomBytes } from "node:crypto";

/**
 * What counts as an acceptable business document, and what to call it stored.
 *
 * The sibling of image-file.ts and deliberately separate from it, because the
 * two answer different questions. An image is something we display; a document
 * is something we keep — a TRN certificate, a trade licence — and the accepted
 * types differ: a tax certificate arrives as a PDF far more often than as a
 * photograph, and a PDF has no business being served as a product image.
 *
 * Pure and free of any storage concern, so it can be unit tested without a
 * filesystem. src/lib/storage.ts adds the I/O.
 */

/**
 * 8 MB. A scanned certificate is a page or two; anything much larger is a
 * mistake — somebody's whole scan folder, or a photograph straight off a
 * phone at full resolution. Kept under serverActions.bodySizeLimit in
 * next.config.ts, which must stay a little higher to allow for multipart
 * overhead. Raise both together or the framework refuses first, with its own
 * wording rather than ours.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * Accepted types, identified by their leading bytes rather than by the
 * filename or the browser's Content-Type — both are supplied by the uploader
 * and neither is evidence. Renaming a file to .pdf does not make it one, and
 * four seed products already proved the point for images (DA-25).
 *
 * SVG and Office formats are deliberately absent. An SVG is a document that
 * can carry script, and a .docx is a zip that can carry a macro; neither is
 * what anybody means by "here is our TRN certificate", and both would be
 * stored on our own infrastructure and handed back on request.
 */
const SIGNATURES: {
  ext: string;
  mime: string;
  match: (b: Buffer) => boolean;
}[] = [
  {
    ext: "pdf",
    mime: "application/pdf",
    // %PDF-
    match: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-",
  },
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
    ext: "webp",
    mime: "image/webp",
    match: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

/** Human wording for the refusal, kept next to the list it describes. */
export const ACCEPTED_DOCUMENTS = "PDF, JPEG, PNG or WebP";

export type DocumentCheck =
  { ok: true; ext: string; mime: string } | { ok: false; error: string };

/** Everything that can be decided from the bytes alone. */
export function checkDocument(bytes: Buffer): DocumentCheck {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };

  if (bytes.length > MAX_DOCUMENT_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `That file is ${mb} MB. The limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`,
    };
  }

  if (bytes.length < 12) {
    return {
      ok: false,
      error: `That file is too short to be a ${ACCEPTED_DOCUMENTS}.`,
    };
  }

  const found = SIGNATURES.find((s) => s.match(bytes));
  if (!found) {
    return {
      ok: false,
      error: `That file is not a ${ACCEPTED_DOCUMENTS}. A file renamed to .pdf is still not one.`,
    };
  }

  return { ok: true, ext: found.ext, mime: found.mime };
}

/** The Content-Type to serve a stored document back as. */
export function mimeForExtension(ext: string): string {
  return (
    SIGNATURES.find((s) => s.ext === ext)?.mime ?? "application/octet-stream"
  );
}

/**
 * A storage key that cannot collide and cannot be steered by the uploader.
 *
 * The original filename is never reused as a path segment: it is
 * attacker-controlled input, and two people uploading "trn.pdf" would silently
 * overwrite one another. The label is included only so a human listing the
 * directory can tell what they are looking at.
 */
export function documentKey(label: string, ext: string): string {
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${safe || "document"}-${randomBytes(8).toString("hex")}.${ext}`;
}

/**
 * The uploader's own filename, made safe to show and to offer as a download.
 *
 * Kept because "TRN-Certificate-2026.pdf" tells an admin what they are looking
 * at in a way a generated key never will — but it is display text, not a path.
 *
 * Three things come out, each for its own reason. Directory separators, so it
 * can never be read as a location. Control characters, because a newline in a
 * filename becomes a second header line once this is echoed into
 * Content-Disposition. And double quotes, which would close that header's
 * quoted string early and leave the rest to be read as parameters.
 */
export function safeDisplayName(raw: string, ext: string): string {
  // Written as an explicit filter rather than a regex character class: the
  // class would be a run of unicode escapes nobody can read back, and this
  // is the kind of check that has to be obviously right.
  const base = raw.split("/").pop()!.split(String.fromCharCode(92)).pop()!;

  const cleaned = [...base]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      if (code < 0x20 || code === 0x7f) return false; // control characters
      return character !== '"';
    })
    .join("")
    .trim()
    .slice(0, 120);

  return cleaned || `document.${ext}`;
}
