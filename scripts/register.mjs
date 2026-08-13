/**
 * Renders docs/issue-register.csv as a readable summary, and validates it.
 *
 * The CSV is the single source of truth — it imports straight into a
 * spreadsheet. This script exists so the register can be read at a glance and
 * so a malformed row is caught rather than silently mangling the import.
 *
 * Run with `npm run register`, or `npm run register -- --md` to regenerate
 * docs/ISSUE-REGISTER.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = resolve(root, "docs/issue-register.csv");

/** Minimal RFC4180 parser — handles quoted fields containing commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const [header, ...data] = rows;
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

const REQUIRED = ["ID", "Area", "Item", "Why it matters", "Owner", "Priority", "Status"];
const VALID_STATUS = new Set(["Open", "In progress", "Done", "Deferred"]);
const VALID_PRIORITY = new Set(["P1", "P2", "P3"]);

let problems = 0;
const fail = (msg) => {
  problems += 1;
  console.log(`  PROBLEM  ${msg}`);
};

for (const field of REQUIRED) {
  if (!(field in col)) fail(`missing required column "${field}"`);
}
if (problems > 0) process.exit(1);

const seen = new Set();
const items = data.map((r, i) => {
  const item = Object.fromEntries(header.map((h, j) => [h.trim(), (r[j] ?? "").trim()]));
  const where = `row ${i + 2} (${item.ID || "no id"})`;

  if (!item.ID) fail(`${where}: blank ID`);
  if (seen.has(item.ID)) fail(`${where}: duplicate ID`);
  seen.add(item.ID);

  if (!VALID_STATUS.has(item.Status)) fail(`${where}: bad Status "${item.Status}"`);
  if (!VALID_PRIORITY.has(item.Priority)) fail(`${where}: bad Priority "${item.Priority}"`);
  if (r.length !== header.length) {
    fail(`${where}: has ${r.length} fields, header has ${header.length}`);
  }
  return item;
});

/* ---------- summary ---------- */

const by = (key) =>
  items.reduce((acc, it) => {
    acc[it[key]] = (acc[it[key]] ?? 0) + 1;
    return acc;
  }, {});

const outstanding = items.filter(
  (it) => it.Status === "Open" || it.Status === "In progress"
);

console.log("\nAussieMed issue register\n");
console.log(`  ${items.length} items`);
console.log(`  status:    ${JSON.stringify(by("Status"))}`);
console.log(`  priority:  ${JSON.stringify(by("Priority"))}`);
console.log(`  owner:     ${JSON.stringify(by("Owner"))}`);

const blockers = outstanding.filter((it) => it.Priority === "P1");
if (blockers.length > 0) {
  console.log(`\n  ${blockers.length} outstanding P1 items:\n`);
  for (const it of blockers) {
    console.log(`    ${it.ID.padEnd(6)} [${it.Owner.padEnd(10)}] ${it.Item}`);
  }
}

/* ---------- optional markdown render ---------- */

if (process.argv.includes("--md")) {
  const esc = (s) => s.replace(/\|/g, "\\|");
  const section = (title, list) =>
    list.length === 0
      ? ""
      : `\n## ${title}\n\n| ID | Item | Owner | Priority | Why it matters |\n| --- | --- | --- | --- | --- |\n` +
        list
          .map(
            (it) =>
              `| ${it.ID} | ${esc(it.Item)} | ${it.Owner} | ${it.Priority} | ${esc(it["Why it matters"])} |`
          )
          .join("\n") +
        "\n";

  const areas = [...new Set(items.map((it) => it.Area))];
  const md =
    `# AussieMed issue register\n\n` +
    `Generated from \`docs/issue-register.csv\` — edit the CSV, not this file.\n` +
    `Run \`npm run register -- --md\` to regenerate.\n\n` +
    `**${items.length} items** · ${outstanding.length} outstanding · ` +
    `${blockers.length} outstanding P1\n` +
    areas
      .map((area) =>
        section(
          area,
          items.filter((it) => it.Area === area)
        )
      )
      .join("");

  writeFileSync(resolve(root, "docs/ISSUE-REGISTER.md"), md, "utf8");
  console.log("\n  wrote docs/ISSUE-REGISTER.md");
}

if (problems > 0) {
  console.log(`\n${problems} problem(s) in the register\n`);
  process.exit(1);
}
console.log("\nRegister is well-formed\n");
