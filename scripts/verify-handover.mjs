import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "FILE-MANIFEST.json");
if (!existsSync(manifestPath)) {
  console.error("Run this check inside a freshly extracted website handover ZIP.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const failures = [];
for (const entry of manifest) {
  const path = resolve(root, entry.path);
  if (!path.startsWith(root + sep)) throw new Error("Invalid path in handover manifest");
  if (!existsSync(path)) {
    failures.push(`Missing: ${entry.path}`);
    continue;
  }
  const data = readFileSync(path);
  if (data.length !== entry.bytes || createHash("sha256").update(data).digest("hex") !== entry.sha256) {
    failures.push(`Changed or incomplete: ${entry.path}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  console.error("Extract the complete replacement ZIP into a new folder before setup.");
  process.exit(1);
}
console.log(`Verified ${manifest.length} packaged files. Extraction is complete.`);
