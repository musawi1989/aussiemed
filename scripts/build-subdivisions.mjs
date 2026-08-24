/**
 * Generates src/data/subdivisions.json — the subdivisions for every country
 * geo.ts does NOT already hold by hand.
 *
 * TWO LISTS, STILL DELIBERATELY DIFFERENT.
 *
 * geo.ts keeps seventeen countries inline: the GCC and the places suppliers
 * ship from. Those are curated, not generated — the UAE is ordered with Abu
 * Dhabi and Dubai first because that is where the parcels go, the United
 * States is fifty states and DC rather than the package's sixty-two with
 * American Samoa and Guam, and the labels ("Emirate", "Governorate") are the
 * word each country actually uses. Regenerating over them would undo all of
 * that, and would change strings that matchSubdivision compares against
 * addresses already in the database.
 *
 * So this file is the OTHER 135. It is never imported by a client component;
 * it is read by the API route at /api/v1/subdivisions/[country], which hands
 * back one country at a time. Bundling all of it would put roughly 3,300
 * entries into every form that renders a country picker, which is exactly the
 * weight BE-47 was raised about.
 *
 * Source: country-region-data (MIT), a devDependency. The generated JSON is
 * committed, so nothing needs installing to build or run the site.
 *
 * Run: npm run subdivisions:build
 */

import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const geo = await import(pathToFileURL(join(root, "src", "lib", "geo.ts")).href);
const source = require("country-region-data").allCountries;

const byCode = new Map(source.map(([, code, regions]) => [code, regions]));

const out = {};
const curated = [];
const missing = [];
let entries = 0;

for (const country of geo.COUNTRIES) {
  // Hand-held countries are left alone — see the note above.
  if (geo.hasSubdivisions(country.code)) {
    curated.push(country.code);
    continue;
  }

  const regions = byCode.get(country.code) ?? [];
  const names = [...new Set(regions.map(([name]) => name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );

  if (names.length === 0) {
    // Singapore, Monaco, the Vatican and other single-region states genuinely
    // have nothing under them. The form falls back to a free-text box, which
    // is honest rather than a dropdown holding one option.
    missing.push(country.code);
    continue;
  }

  out[country.code] = names;
  entries += names.length;
}

await mkdir(join(root, "src", "data"), { recursive: true });
await writeFile(
  join(root, "src", "data", "subdivisions.json"),
  JSON.stringify(out, null, 0) + "\n",
  "utf8"
);

const size = Math.round(JSON.stringify(out).length / 1024);
console.log("  wrote src/data/subdivisions.json");
console.log("  " + Object.keys(out).length + " countries, " + entries + " subdivisions (" + size + " KB, server-side only)");
console.log("  left " + curated.length + " curated countries in geo.ts untouched: " + curated.join(", "));
if (missing.length) {
  console.log("  no subdivisions, free text as before: " + missing.join(", "));
}
