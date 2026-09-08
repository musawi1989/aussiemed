/**
 * What kinds of paperwork a product can carry, and how each is written.
 *
 * Its own module, and not part of admin.ts, because three different places
 * need it and one of them is a browser. admin.ts is `server-only` — it reaches
 * the database and the session — so importing these constants from there into
 * the upload form would drag the whole service layer towards the client and
 * fail the build. Nothing here touches I/O, so everyone can have it.
 *
 * The list is closed on purpose. The kind is what a buyer scans for, and an
 * admin free-typing "MSDS", "S.D.S." and "Safety Sheet" across three products
 * makes the product page unreadable and a filter impossible later.
 */
export const DOCUMENT_KINDS = [
  "SDS",
  "Specification",
  "Certificate",
  "Flyer",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** How each kind is written on screen. SDS stays an abbreviation — that is
 *  what it is called in a laboratory, and spelling it out helps nobody. */
export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  SDS: "Safety data sheet",
  Specification: "Specification",
  Certificate: "Certificate",
  Flyer: "Flyer",
};

/** The stored kind, written for a reader — unknown values pass through. */
export function documentKindLabel(kind: string): string {
  return DOCUMENT_KIND_LABELS[kind as DocumentKind] ?? kind;
}

/**
 * "PDF" from a stored path, for the line under a download link.
 *
 * Read from our own generated key, never from anything the uploader typed, so
 * it is a description of the file rather than a claim about it. Returns an
 * empty string rather than a guess when there is no extension to read.
 */
export function fileExtension(href: string): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(href);
  return match ? match[1].toUpperCase() : "";
}
