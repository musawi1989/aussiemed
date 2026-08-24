/**
 * Copies the flag SVGs for the countries in COUNTRIES into public/flags.
 *
 * WHY IMAGES AND NOT EMOJI. A flag emoji is a pair of regional indicator
 * symbols, and Windows ships no glyphs for them — Segoe UI Emoji draws "AE"
 * rather than the UAE flag. A trade buyer is overwhelmingly likely to be at an
 * office desktop, so the emoji would have shown letters to most of the people
 * it was meant to help, which is worse than nothing: it reads as something
 * that failed to load.
 *
 * WHY A COPY AND NOT THE PACKAGE. flag-icons is a devDependency and stays out
 * of the build: importing its CSS would pull every flag into the bundle for
 * the sake of the one on screen. Copying the files we actually list means the
 * browser fetches exactly one small SVG, and caches it.
 *
 * Only the countries in COUNTRIES are copied. The package carries 271 files —
 * territories and subdivisions this form cannot select — and a flag nobody can
 * choose is dead weight.
 *
 * Run: npm run flags:build
 */

import { mkdir, copyFile, readdir, rm, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "flag-icons", "flags", "4x3");
const target = join(root, "public", "flags");

// pathToFileURL: a bare Windows path is not a URL the ESM loader accepts.
const geo = await import(pathToFileURL(join(root, "src", "lib", "geo.ts")).href);

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });

const missing = [];
const heavy = [];
let copied = 0;
let bytes = 0;

for (const country of geo.COUNTRIES) {
  const file = country.code.toLowerCase() + ".svg";
  try {
    await copyFile(join(source, file), join(target, file));
    const size = (await stat(join(target, file))).size;
    bytes += size;
    copied++;
    // A few flags carry a detailed coat of arms and run into six figures of
    // bytes. Only one is fetched at a time and the UAE — nearly all of this
    // traffic — is under a kilobyte, so this is worth knowing, not fixing.
    if (size > 50_000) heavy.push(country.code + " " + Math.round(size / 1024) + "KB");
  } catch {
    missing.push(country.code + " (" + country.name + ")");
  }
}

console.log("  copied " + copied + " flags into public/flags (" + Math.round(bytes / 1024) + " KB)");

if (missing.length) {
  // Not fatal — the form falls back to the dialling code on its own. But an
  // unflagged country should be known about rather than found by a buyer.
  console.log("  no flag for: " + missing.join(", "));
}

if (heavy.length) {
  console.log("  heaviest: " + heavy.join(", ") + " — one is fetched at a time");
}

const spare = (await readdir(source)).length - copied;
console.log("  left " + spare + " unused flags in the package, as intended");
