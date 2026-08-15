import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_IMAGE_BYTES, checkImage, detectImage, imageKey } from "./image-file.ts";

/**
 * Enough bytes to clear the 12-byte minimum, with the right leading signature.
 * Real files are longer; nothing here reads past the header.
 */
const withHeader = (...head: number[]) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

const JPEG = withHeader(0xff, 0xd8, 0xff, 0xe0);
const PNG = withHeader(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(16)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP", "latin1"),
  Buffer.alloc(16),
]);
const AVIF = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from("ftypavif", "latin1"),
  Buffer.alloc(16),
]);

describe("image type detection", () => {
  it("recognises the formats the storefront can render", () => {
    assert.equal(detectImage(JPEG)?.ext, "jpg");
    assert.equal(detectImage(PNG)?.ext, "png");
    assert.equal(detectImage(GIF)?.ext, "gif");
    assert.equal(detectImage(WEBP)?.ext, "webp");
    assert.equal(detectImage(AVIF)?.ext, "avif");
  });

  it("reports the matching mime type, not the extension twice", () => {
    assert.equal(detectImage(JPEG)?.mime, "image/jpeg");
    assert.equal(detectImage(WEBP)?.mime, "image/webp");
  });

  /**
   * The defect this exists to prevent: four seed products were SVG saved with
   * a .jpg extension, and the image optimiser rejected them with a 400 at
   * request time rather than at upload — DA-25.
   */
  it("refuses an SVG however it is named", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    assert.equal(detectImage(svg), null);
    assert.equal(checkImage(svg).ok, false);
  });

  it("refuses other files dressed as images", () => {
    assert.equal(detectImage(Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3")), null);
    assert.equal(detectImage(Buffer.from("PK zip contents here")), null);
    assert.equal(detectImage(Buffer.from("plain text pretending")), null);
  });

  it("does not read past the end of a very short file", () => {
    assert.equal(detectImage(Buffer.alloc(0)), null);
    assert.equal(detectImage(Buffer.from([0xff, 0xd8, 0xff])), null);
  });

  it("does not mistake RIFF alone for WebP", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE", "latin1"),
      Buffer.alloc(16),
    ]);
    assert.equal(detectImage(wav), null);
  });
});

describe("upload checks", () => {
  it("accepts a real image", () => {
    const result = checkImage(PNG);
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.ext, "png");
  });

  it("rejects an empty file with a reason", () => {
    const result = checkImage(Buffer.alloc(0));
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /empty/i);
  });

  it("rejects anything over the limit, naming the size", () => {
    const tooBig = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const result = checkImage(tooBig);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.error : "", /5 MB/);
  });

  it("accepts a file exactly on the limit", () => {
    const exact = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES - JPEG.length)]);
    assert.equal(exact.length, MAX_IMAGE_BYTES);
    assert.equal(checkImage(exact).ok, true);
  });
});

describe("storage keys", () => {
  it("keeps the slug readable and adds the extension", () => {
    assert.match(imageKey("nitrile-gloves-blue", "jpg"), /^nitrile-gloves-blue-[0-9a-f]{16}\.jpg$/);
  });

  it("never collides, even for the same product and file", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => imageKey("same-product", "png"))
    );
    assert.equal(keys.size, 200);
  });

  /**
   * The filename is attacker-controlled and becomes a path segment. A key that
   * can carry a separator or a traversal is the whole risk of accepting
   * uploads at all.
   */
  it("cannot be steered out of its folder", () => {
    for (const hostile of [
      "../../etc/passwd",
      "..\\..\\windows\\system32",
      "a/b/c",
      "with spaces and $ymbols!",
      "%2e%2e%2f",
    ]) {
      const key = imageKey(hostile, "png");
      assert.ok(!key.includes("/"), `slash survived in ${key}`);
      assert.ok(!key.includes("\\"), `backslash survived in ${key}`);
      assert.ok(!key.includes(".."), `traversal survived in ${key}`);
      assert.match(key, /^[a-z0-9-]+-[0-9a-f]{16}\.png$/);
    }
  });

  it("still produces a usable key when the slug reduces to nothing", () => {
    assert.match(imageKey("///", "webp"), /^product-[0-9a-f]{16}\.webp$/);
  });

  it("caps runaway slugs so the filename stays sane", () => {
    const key = imageKey("x".repeat(300), "jpg");
    assert.ok(key.length < 80, `key was ${key.length} characters`);
  });
});
