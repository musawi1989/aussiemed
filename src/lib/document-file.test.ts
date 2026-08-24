import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DOCUMENT_BYTES,
  checkDocument,
  documentKey,
  mimeForExtension,
  safeDisplayName,
} from "./document-file.ts";

/** Bytes that start like the real thing, padded past the minimum length. */
const withHeader = (header: number[] | string, length = 64): Buffer => {
  const head = typeof header === "string" ? Buffer.from(header, "latin1") : Buffer.from(header);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, length - head.length))]);
};

describe("checkDocument", () => {
  it("accepts a PDF", () => {
    const result = checkDocument(withHeader("%PDF-1.7"));
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.ext, "pdf");
    assert.equal(result.ok && result.mime, "application/pdf");
  });

  it("accepts a scanned certificate as JPEG or PNG", () => {
    assert.equal(checkDocument(withHeader([0xff, 0xd8, 0xff, 0xe0])).ok, true);
    assert.equal(
      checkDocument(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).ok,
      true
    );
  });

  it("accepts WebP, which needs both of its markers", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.alloc(4),
      Buffer.from("WEBP", "latin1"),
      Buffer.alloc(48),
    ]);
    assert.equal(checkDocument(webp).ok, true);
    // RIFF alone is a container that could hold anything — a .wav, say.
    const notWebp = Buffer.concat([Buffer.from("RIFF", "latin1"), Buffer.alloc(60)]);
    assert.equal(checkDocument(notWebp).ok, false);
  });

  it("judges the bytes, not the name", () => {
    // The whole point: a text file called certificate.pdf is not a PDF, and
    // the browser's Content-Type is the uploader's word for it.
    const result = checkDocument(withHeader("Dear sir, please find attached"));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /renamed to \.pdf/);
  });

  it("refuses an SVG, which is a document that can carry script", () => {
    assert.equal(checkDocument(withHeader("<svg xmlns=...")).ok, false);
  });

  it("refuses a .docx, which is a zip that can carry a macro", () => {
    assert.equal(checkDocument(withHeader([0x50, 0x4b, 0x03, 0x04])).ok, false);
  });

  it("refuses an empty file", () => {
    const result = checkDocument(Buffer.alloc(0));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /empty/);
  });

  it("refuses something too short to identify", () => {
    assert.equal(checkDocument(Buffer.from("%PDF")).ok, false);
  });

  it("refuses anything over the limit, and says how big it was", () => {
    const huge = Buffer.concat([
      Buffer.from("%PDF-1.7", "latin1"),
      Buffer.alloc(MAX_DOCUMENT_BYTES),
    ]);
    const result = checkDocument(huge);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /MB\. The limit is 8 MB/);
  });

  it("checks the size before the type", () => {
    // A 40 MB file that is not a PDF should be refused for being 40 MB — the
    // useful half of the answer. Refusing it on type first would send somebody
    // converting a file that was never going to fit.
    const huge = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    const result = checkDocument(huge);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /limit/);
  });
});

describe("mimeForExtension", () => {
  it("knows the types it accepts", () => {
    assert.equal(mimeForExtension("pdf"), "application/pdf");
    assert.equal(mimeForExtension("jpg"), "image/jpeg");
  });

  it("falls back to a type no browser will run", () => {
    assert.equal(mimeForExtension("exe"), "application/octet-stream");
  });
});

describe("documentKey", () => {
  it("keeps the label readable and adds randomness", () => {
    const key = documentKey("AussieMed Distribution", "pdf");
    assert.match(key, /^aussiemed-distribution-[0-9a-f]{16}\.pdf$/);
  });

  it("never collides for the same label", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => documentKey("Acme", "pdf"))
    );
    assert.equal(keys.size, 50);
  });

  it("cannot be steered into another directory", () => {
    const key = documentKey("../../etc/passwd", "pdf");
    assert.ok(!key.includes("/"), key);
    assert.ok(!key.includes(".."), key);
  });

  it("still produces something for a label of pure punctuation", () => {
    assert.match(documentKey("...", "pdf"), /^document-[0-9a-f]{16}\.pdf$/);
  });
});

describe("safeDisplayName", () => {
  it("keeps a sensible name as it is", () => {
    assert.equal(safeDisplayName("TRN-Certificate-2026.pdf", "pdf"), "TRN-Certificate-2026.pdf");
  });

  it("drops the directory part, in either slash", () => {
    assert.equal(safeDisplayName("/home/me/trn.pdf", "pdf"), "trn.pdf");
    assert.equal(
      safeDisplayName(["C:", "Users", "me", "trn.pdf"].join(String.fromCharCode(92)), "pdf"),
      "trn.pdf"
    );
  });

  it("strips control characters, which would forge a header line", () => {
    // A newline here becomes a second header when echoed into
    // Content-Disposition, and everything after it is attacker-written.
    const nasty = `trn${String.fromCharCode(13, 10)}Set-Cookie: admin=1.pdf`;
    const safe = safeDisplayName(nasty, "pdf");
    assert.ok(!safe.includes(String.fromCharCode(10)), safe);
    assert.ok(!safe.includes(String.fromCharCode(13)), safe);
  });

  it("strips double quotes, which would close the header's string early", () => {
    const safe = safeDisplayName('trn".pdf', "pdf");
    assert.ok(!safe.includes('"'), safe);
  });

  it("keeps spaces, which are ordinary in a filename", () => {
    assert.equal(safeDisplayName("TRN certificate.pdf", "pdf"), "TRN certificate.pdf");
  });

  it("falls back rather than returning nothing", () => {
    assert.equal(safeDisplayName("", "pdf"), "document.pdf");
    assert.equal(safeDisplayName("///", "pdf"), "document.pdf");
  });

  it("caps a preposterous name", () => {
    assert.ok(safeDisplayName("a".repeat(500) + ".pdf", "pdf").length <= 120);
  });
});
