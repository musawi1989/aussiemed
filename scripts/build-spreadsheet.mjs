/**
 * Generates "docs/Things That Need Attention.xlsx" from the register CSV.
 *
 * The CSV stays the source of truth — this is a rendered view, regenerated on
 * every `npm run register`. Editing the workbook directly will be overwritten,
 * which is deliberate: two editable copies of the same list drift apart.
 */

import ExcelJS from "exceljs";
import { resolve } from "node:path";
import {
  COLUMNS,
  ROOT,
  byUrgency,
  isOutstanding,
  loadRegister,
} from "./register-data.mjs";

const OUT = resolve(ROOT, "docs/Things That Need Attention.xlsx");

/* ---------- brand palette ---------- */
const NAVY = "FF29387D";
const RED = "FFEA2227";
const WHITE = "FFFFFFFF";
const AMBER = "FFB45309";
const AMBER_BG = "FFFDF3E4";
const RED_BG = "FFFDECED";
const GREY_BG = "FFF4F5F8";
const GREEN = "FF146C43";
const GREEN_BG = "FFE4F2EA";

const WIDTHS = {
  ID: 9,
  Area: 16,
  Item: 42,
  "Why it matters": 62,
  Owner: 13,
  Priority: 10,
  Status: 13,
  Notes: 58,
};

const { items } = loadRegister();

const workbook = new ExcelJS.Workbook();
workbook.creator = "AussieMed rebuild";
workbook.created = new Date(2026, 7, 14);
workbook.modified = new Date(2026, 7, 14);

/* ------------------------------------------------------------------ *
 * Summary
 * ------------------------------------------------------------------ */

const summary = workbook.addWorksheet("Summary", {
  properties: { tabColor: { argb: NAVY } },
});

summary.mergeCells("A1:D1");
const title = summary.getCell("A1");
title.value = "AussieMed — things that need attention";
title.font = { size: 16, bold: true, color: { argb: NAVY } };
summary.getRow(1).height = 26;

summary.mergeCells("A2:D2");
summary.getCell("A2").value =
  "Generated from docs/issue-register.csv. Edit the CSV, then run: npm run register";
summary.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF666666" } };

const outstanding = items.filter(isOutstanding);
const count = (key, value) => items.filter((i) => i[key] === value).length;
const countOpen = (key, value) =>
  outstanding.filter((i) => i[key] === value).length;

const blocks = [
  ["", ""],
  ["Total items", items.length],
  ["Decisions recorded", items.filter((i) => i.Area === "Decision").length],
  ["Outstanding", outstanding.length],
  ["Closed", count("Status", "Done")],
  ["Deferred", count("Status", "Deferred")],
  ["", ""],
  ["OUTSTANDING BY PRIORITY", ""],
  ["P1 — blocks launch or correctness", countOpen("Priority", "P1")],
  ["P2 — needed before launch", countOpen("Priority", "P2")],
  ["P3 — desirable", countOpen("Priority", "P3")],
  ["", ""],
  ["OUTSTANDING BY OWNER", ""],
  ...["Client", "Accountant", "Agency", "Dev"].map((o) => [o, countOpen("Owner", o)]),
  ["", ""],
  ["OUTSTANDING BY AREA", ""],
  ...[...new Set(items.map((i) => i.Area))]
    .filter((a) => a !== "Done")
    .map((a) => [a, countOpen("Area", a)]),
];

let r = 3;
for (const [label, value] of blocks) {
  r += 1;
  const row = summary.getRow(r);
  row.getCell(1).value = label;
  row.getCell(2).value = value === "" ? null : value;
  if (label === label.toUpperCase() && label !== "") {
    row.getCell(1).font = { bold: true, color: { argb: NAVY }, size: 11 };
  }
  if (typeof value === "number") {
    row.getCell(2).alignment = { horizontal: "left" };
    row.getCell(2).font = { bold: true };
  }
}

summary.getColumn(1).width = 40;
summary.getColumn(2).width = 12;

/* ------------------------------------------------------------------ *
 * Item sheets
 * ------------------------------------------------------------------ */

function addSheet(name, rows, tabColor) {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { argb: tabColor } },
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((key) => ({
    header: key,
    key,
    width: WIDTHS[key] ?? 20,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: WHITE } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  for (const item of rows) {
    sheet.addRow(Object.fromEntries(COLUMNS.map((k) => [k, item[k] ?? ""])));
  }

  sheet.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "top", wrapText: true };

    const priority = row.getCell("Priority");
    const status = row.getCell("Status");
    const owner = row.getCell("Owner");

    row.getCell("ID").font = { bold: true, color: { argb: NAVY } };

    // Priority carries the visual weight — P1 must be unmissable.
    if (priority.value === "P1") {
      priority.font = { bold: true, color: { argb: RED } };
      priority.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED_BG } };
    } else if (priority.value === "P2") {
      priority.font = { bold: true, color: { argb: AMBER } };
      priority.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBER_BG } };
    } else {
      priority.font = { color: { argb: "FF666666" } };
      priority.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREY_BG } };
    }
    priority.alignment = { vertical: "top", horizontal: "center" };

    if (status.value === "Done") {
      status.font = { bold: true, color: { argb: GREEN } };
      status.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_BG } };
    } else if (status.value === "Deferred") {
      status.font = { color: { argb: "FF666666" } };
    }

    // Anything the client or their accountant must answer is the slow path,
    // so make ownership scannable.
    if (owner.value === "Client" || owner.value === "Accountant") {
      owner.font = { bold: true, color: { argb: NAVY } };
    }
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: COLUMNS.length },
  };

  return sheet;
}

const isDecision = (i) => i.Area === "Decision";

addSheet(
  "Needs attention",
  outstanding.filter((i) => !isDecision(i)).sort(byUrgency),
  RED
);
addSheet(
  "Decisions",
  items.filter(isDecision),
  NAVY
);
addSheet(
  "Deferred",
  items.filter((i) => i.Status === "Deferred").sort(byUrgency),
  "FF8B90A0"
);
addSheet(
  "Done",
  items.filter((i) => i.Status === "Done" && !isDecision(i)).sort(byUrgency),
  GREEN
);

await workbook.xlsx.writeFile(OUT);

console.log(`  wrote docs/Things That Need Attention.xlsx`);
console.log(
  `    Needs attention ${outstanding.filter((i) => !isDecision(i)).length}` +
    ` · Decisions ${items.filter(isDecision).length}` +
    ` · Deferred ${count("Status", "Deferred")}` +
    ` · Done ${items.filter((i) => i.Status === "Done" && !isDecision(i)).length}`
);
