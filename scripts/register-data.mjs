/**
 * Shared loader for docs/issue-register.csv.
 *
 * Both the validator and the spreadsheet generator read through here, so the
 * register can only ever be parsed one way.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CSV_PATH = resolve(ROOT, "docs/issue-register.csv");

export const COLUMNS = [
  "ID",
  "Area",
  "Item",
  "Why it matters",
  "Owner",
  "Priority",
  "Status",
  "Notes",
];

export const VALID_STATUS = ["Open", "In progress", "Done", "Deferred"];
export const VALID_PRIORITY = ["P1", "P2", "P3"];

/** Minimal RFC4180 parser — handles quoted fields containing commas. */
export function parseCsv(text) {
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

export function loadRegister() {
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const [header, ...data] = rows;
  const keys = header.map((h) => h.trim());

  const items = data.map((r, i) => {
    const item = Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? "").trim()]));
    item.__row = i + 2;
    item.__fieldCount = r.length;
    return item;
  });

  return { keys, items };
}

export const isOutstanding = (item) =>
  item.Status === "Open" || item.Status === "In progress";

/** P1 first, then by ID, so the most urgent work is always at the top. */
export function byUrgency(a, b) {
  const order = { P1: 0, P2: 1, P3: 2 };
  const p = (order[a.Priority] ?? 9) - (order[b.Priority] ?? 9);
  return p !== 0 ? p : a.ID.localeCompare(b.ID);
}
