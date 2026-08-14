/**
 * Validates docs/issue-register.csv and prints a summary.
 *
 * The CSV is the single source of truth. This script guards it, because a
 * malformed row silently mangles a spreadsheet import — exactly the defect
 * that broke the old platform's bulk upload.
 *
 * `npm run register` validates and prints.
 * `npm run register -- --md` also regenerates docs/ISSUE-REGISTER.md.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COLUMNS,
  ROOT,
  VALID_PRIORITY,
  VALID_STATUS,
  isOutstanding,
  loadRegister,
} from "./register-data.mjs";

const { keys, items } = loadRegister();

let problems = 0;
const fail = (msg) => {
  problems += 1;
  console.log(`  PROBLEM  ${msg}`);
};

for (const field of COLUMNS) {
  if (!keys.includes(field)) fail(`missing required column "${field}"`);
}
if (problems > 0) process.exit(1);

const seen = new Set();
for (const item of items) {
  const where = `row ${item.__row} (${item.ID || "no id"})`;

  if (!item.ID) fail(`${where}: blank ID`);
  if (seen.has(item.ID)) fail(`${where}: duplicate ID`);
  seen.add(item.ID);

  if (!item.Item) fail(`${where}: blank Item`);
  if (!VALID_STATUS.includes(item.Status)) {
    fail(`${where}: bad Status "${item.Status}"`);
  }
  if (!VALID_PRIORITY.includes(item.Priority)) {
    fail(`${where}: bad Priority "${item.Priority}"`);
  }
  // An unquoted comma splits a field and shifts every column after it.
  if (item.__fieldCount !== keys.length) {
    fail(
      `${where}: has ${item.__fieldCount} fields, header has ${keys.length} — check for an unquoted comma`
    );
  }
}

/* ---------- summary ---------- */

const tally = (key, list = items) =>
  list.reduce((acc, it) => {
    acc[it[key]] = (acc[it[key]] ?? 0) + 1;
    return acc;
  }, {});

const outstanding = items.filter(isOutstanding);
const blockers = outstanding.filter((it) => it.Priority === "P1");

console.log("\nAussieMed issue register\n");
console.log(`  ${items.length} items`);
console.log(`  status:    ${JSON.stringify(tally("Status"))}`);
console.log(`  priority:  ${JSON.stringify(tally("Priority", outstanding))} (outstanding)`);
console.log(`  owner:     ${JSON.stringify(tally("Owner", outstanding))} (outstanding)`);

if (blockers.length > 0) {
  console.log(`\n  ${blockers.length} outstanding P1 items:\n`);
  for (const it of blockers) {
    console.log(`    ${it.ID.padEnd(6)} [${it.Owner.padEnd(10)}] ${it.Item}`);
  }
}

/* ---------- optional markdown render ---------- */

if (process.argv.includes("--md")) {
  const esc = (s) => (s ?? "").replace(/\|/g, "\\|");
  const table = (list) =>
    `| ID | Item | Owner | Priority | Status | Why it matters |\n` +
    `| --- | --- | --- | --- | --- | --- |\n` +
    list
      .map(
        (it) =>
          `| ${it.ID} | ${esc(it.Item)} | ${it.Owner} | ${it.Priority} | ${it.Status} | ${esc(it["Why it matters"])} |`
      )
      .join("\n");

  const areas = [...new Set(items.map((it) => it.Area))];
  const md =
    `# AussieMed — things that need attention\n\n` +
    `Generated from \`docs/issue-register.csv\`. Edit the CSV, not this file, ` +
    `then run \`npm run register\`.\n\n` +
    `**${items.length} items** · ${outstanding.length} outstanding · ` +
    `**${blockers.length} outstanding P1**\n\n` +
    `A spreadsheet version is at \`docs/Things That Need Attention.xlsx\`.\n` +
    areas
      .map((area) => {
        const list = items.filter((it) => it.Area === area);
        return list.length ? `\n## ${area}\n\n${table(list)}\n` : "";
      })
      .join("");

  writeFileSync(resolve(ROOT, "docs/ISSUE-REGISTER.md"), md, "utf8");
  console.log("\n  wrote docs/ISSUE-REGISTER.md");
}

if (problems > 0) {
  console.log(`\n${problems} problem(s) in the register\n`);
  process.exit(1);
}
console.log("\n  Register is well-formed");
