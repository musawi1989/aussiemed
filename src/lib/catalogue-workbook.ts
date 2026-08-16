import "server-only";

import ExcelJS from "exceljs";
import { COLUMNS, HEADERS, type RawRow } from "./catalogue-template";

/**
 * The .xlsx side of the catalogue upload — BE-04.
 *
 * Kept apart from catalogue-template.ts so the rules stay testable without a
 * spreadsheet library, and so this file is the only place that knows what a
 * workbook is.
 *
 * Read as a workbook, never as text split on commas. A category named
 * "Gloves, Nitrile" shifted every column after it on the old platform and the
 * prices were wrong for weeks before anyone noticed.
 */

const SHEET = "Catalogue";
const NOTES = "How to fill this in";

/** The template, with the headers, one worked example, and a notes sheet. */
export async function buildTemplateWorkbook(
  suppliers: string[],
  categories: string[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AussieMed";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF212B5E" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  // Required columns get a red header, so a glance says what cannot be left out.
  COLUMNS.forEach((column, index) => {
    if (column.required) {
      header.getCell(index + 1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD4132C" },
      };
    }
  });

  const example = sheet.addRow(COLUMNS.map((c) => c.example));
  example.font = { italic: true, color: { argb: "FF7C84A3" } };

  /* --- the notes sheet --- */

  const notes = workbook.addWorksheet(NOTES);
  notes.columns = [
    { header: "Column", key: "column", width: 24 },
    { header: "Required", key: "required", width: 11 },
    { header: "What to put in it", key: "help", width: 78 },
  ];
  notes.getRow(1).font = { bold: true };

  for (const column of COLUMNS) {
    notes.addRow({
      column: column.header,
      required: column.required ? "Yes" : "Optional",
      help: column.help,
    });
  }

  notes.addRow({});
  notes.addRow({ column: "One row is one pack" , help: "A product sold in three pack sizes gets three rows sharing the same Product code. The row is the thing a customer adds to the basket." });
  notes.addRow({ column: "Delete the example", help: "The grey italic row is an example. Delete it before sending the file back, or it will be imported as a product." });
  notes.addRow({ column: "Nothing is skipped", help: "If a row cannot be read you are told the row number and what is wrong with it. Rows that are fine still load; rows that are not are listed for you to correct." });
  notes.addRow({ column: "Re-uploading is safe", help: "Matching on Item code, so uploading a corrected file updates the same products rather than creating duplicates." });

  if (suppliers.length > 0) {
    notes.addRow({});
    notes.addRow({ column: "Suppliers set up", help: suppliers.join(" · ") });
    notes.addRow({ column: "", help: "Primary and Backup supplier must match one of these exactly. Add a supplier in the admin first if it is missing." });
  }
  if (categories.length > 0) {
    notes.addRow({});
    notes.addRow({ column: "Existing categories", help: categories.slice(0, 60).join(" · ") });
    notes.addRow({ column: "", help: "A category that does not exist yet is created. Use > between levels." });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type SheetReadResult =
  | { ok: true; rows: RawRow[] }
  | { ok: false; error: string };

/** Everything a cell can hold, reduced to the string a person typed. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const rich = value as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join("");
    if (typeof rich.text === "string") return rich.text;
    // A formula cell: take what it evaluated to, not the formula.
    if (rich.result !== undefined && rich.result !== null) return String(rich.result);
    return "";
  }
  return String(value);
}

export async function readCatalogueWorkbook(bytes: Buffer): Promise<SheetReadResult> {
  const workbook = new ExcelJS.Workbook();

  try {
    // exceljs types its own Buffer; a Node Buffer is accepted at runtime and
    // is what an upload gives us.
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      error:
        "That file could not be opened as a spreadsheet. Save it as .xlsx from Excel or Numbers and try again — a .csv will not do, because a comma inside a category name would shift every column after it.",
    };
  }

  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (!sheet) return { ok: false, error: "That file has no sheets in it." };

  const headerRow = sheet.getRow(1);
  const headings: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
    headings[index - 1] = cellText(cell.value).trim();
  });

  const missing = HEADERS.filter((h) => !headings.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `The sheet is missing these columns: ${missing.join(", ")}. Download the template again and paste your data into it.`,
    };
  }

  const rows: RawRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const record: RawRow = {};
    headings.forEach((heading, index) => {
      if (heading) record[heading] = cellText(row.getCell(index + 1).value).trim();
    });

    // A row where every cell is blank is spacing, not data.
    if (Object.values(record).every((v) => v === "")) return;
    rows.push(record);
  });

  return { ok: true, rows };
}
