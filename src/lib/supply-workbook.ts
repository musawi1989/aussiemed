import "server-only";

import ExcelJS from "exceljs";

import { SUPPLY_COLUMNS } from "./supply-terms";

/**
 * Reading and writing the supplier's price-list spreadsheet.
 *
 * Split from supply-terms.ts for the same reason the catalogue tool is split:
 * the rules about what a valid cost is are pure and testable, and this file is
 * the part that needs exceljs and a filesystem. What counts as a good row is
 * decided over there, so a second reader could not accept what this one
 * refuses.
 *
 * .xlsx and never .csv — a comma inside a product name shifts every column
 * after it, and this file is mostly prices.
 */

const SHEET = "Your prices";

export type SupplyRowSeed = {
  skuCode: string;
  productName: string;
  unitLabel: string;
  supplierPartNumber: string | null;
  costFils: number | null;
  leadTimeDays: number | null;
  isAvailable: boolean;
};

/**
 * The template, filled in with what we already hold.
 *
 * Pre-filled on purpose: a supplier asked to type forty item codes from
 * scratch will get one wrong, and a row whose code does not match is a row we
 * cannot apply. Sending back their own current terms also makes the file a
 * statement of what we believe, which is worth checking on its own.
 */
export async function buildSupplyWorkbook(
  companyName: string,
  rows: SupplyRowSeed[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AussieMed";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(SHEET);

  sheet.columns = [
    { header: SUPPLY_COLUMNS[0], key: "skuCode", width: 22 },
    { header: SUPPLY_COLUMNS[1], key: "partNumber", width: 22 },
    { header: SUPPLY_COLUMNS[2], key: "cost", width: 18 },
    { header: SUPPLY_COLUMNS[3], key: "leadTime", width: 18 },
    { header: SUPPLY_COLUMNS[4], key: "available", width: 26 },
    { header: "Item (do not edit)", key: "productName", width: 46 },
    { header: "Pack (do not edit)", key: "unitLabel", width: 22 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow({
      skuCode: row.skuCode,
      partNumber: row.supplierPartNumber ?? "",
      // As a number so Excel does not treat it as text and warn on every cell.
      cost: row.costFils === null ? "" : Number((row.costFils / 100).toFixed(2)),
      leadTime: row.leadTimeDays ?? "",
      available: row.isAvailable ? "yes" : "no",
      productName: row.productName,
      unitLabel: row.unitLabel,
    });
  }

  sheet.getColumn("cost").numFmt = "0.00";

  const notes = workbook.addWorksheet("How to use this");
  notes.columns = [{ width: 100 }];
  for (const line of [
    `Price list for ${companyName}`,
    "",
    "This is what AussieMed currently holds for you. Change what has moved,",
    "leave the rest, and send the whole file back.",
    "",
    `${SUPPLY_COLUMNS[0]} is how we know which pack a row is about. Do not change it.`,
    "Rows for items we have not set you up to supply are reported back and not applied —",
    "if you should be supplying something, tell us and we will add it.",
    "",
    `${SUPPLY_COLUMNS[2]} is what you charge us for one pack, excluding VAT.`,
    "Write it as 12.34. Leave it blank if there is no agreed price yet — blank means",
    "not agreed, which is not the same as free.",
    "",
    `${SUPPLY_COLUMNS[3]} is days from our order to your despatch. Leave it blank to use`,
    "your usual lead time.",
    "",
    `${SUPPLY_COLUMNS[4]}: yes or no. Leaving it blank changes nothing — so a price`,
    "update will not accidentally put discontinued lines back on.",
    "",
    "The last two columns are there so you can see what each row is. They are ignored.",
  ]) {
    notes.addRow([line]);
  }
  notes.getRow(1).font = { bold: true, size: 14 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export type SupplySheetResult =
  | { ok: true; cells: string[][] }
  | { ok: false; error: string };

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const rich = value as {
      richText?: { text: string }[];
      text?: string;
      result?: unknown;
    };
    if (Array.isArray(rich.richText)) return rich.richText.map((r) => r.text).join("");
    if (typeof rich.text === "string") return rich.text;
    // A formula cell: take what it evaluated to, not the formula.
    if (rich.result !== undefined && rich.result !== null) return String(rich.result);
    return "";
  }
  return String(value);
}

export async function readSupplyWorkbook(bytes: Buffer): Promise<SupplySheetResult> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      error:
        "That file could not be opened as a spreadsheet. Save it as .xlsx from Excel, Numbers or Google Sheets and try again — a .csv will not do, because a comma inside an item name would shift every column after it.",
    };
  }

  const sheet = workbook.getWorksheet(SHEET) ?? workbook.worksheets[0];
  if (!sheet) return { ok: false, error: "That file has no sheets in it." };

  /**
   * Walked by row number rather than with eachRow, which skips blank rows.
   *
   * The parser numbers rows by their position in this array, so a skipped
   * blank would shift every error message after it — telling a supplier to fix
   * row 12 when the bad cell is on row 13 is worse than not naming a row.
   * Blanks are kept as blank rows and ignored there instead.
   *
   * Only the five columns that mean anything. The two trailing "do not edit"
   * columns are for the supplier's eyes and are read past.
   */
  const cells: string[][] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values: string[] = [];
    for (let column = 1; column <= 5; column++) {
      values.push(cellText(row.getCell(column).value).trim());
    }
    cells.push(values);
  }

  return { ok: true, cells };
}
