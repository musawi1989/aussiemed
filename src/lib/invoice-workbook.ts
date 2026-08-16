import "server-only";

import ExcelJS from "exceljs";

/**
 * Invoices as a spreadsheet a bookkeeper can actually use.
 *
 * A note on what this is not. There is no PDF generator in this build, so
 * "download my invoices" cannot mean a folder of PDFs without adding one —
 * and pretending otherwise would produce a button that fails. What a finance
 * team almost always wants from a supplier portal is the figures in a form
 * they can reconcile against their ledger, and that is a spreadsheet. Each
 * invoice also has its own printable page, which any browser will save as a
 * PDF.
 *
 * Two sheets, because two questions get asked. One row per invoice answers
 * "what did we spend"; one row per line answers "what did we buy", and
 * pivoting the second is how somebody finds out they bought forty boxes of
 * the wrong glove.
 */

export type InvoiceForExport = {
  reference: string;
  placedAt: Date;
  status: string;
  paymentStatus: string;
  poReference: string | null;
  subtotalFils: number;
  vatFils: number;
  totalFils: number;
  placedByName: string | null;
  staff: { name: string } | null;
  address: { label: string | null; city: string } | null;
  organisation: { name: string; trn: string | null } | null;
  items: {
    nameSnapshot: string;
    skuCodeSnapshot: string;
    unitLabelSnapshot: string;
    taxClassSnapshot: string;
    qty: number;
    unitPriceFils: number;
    vatFils: number;
    lineTotalFils: number;
  }[];
};

/** Fils to a number Excel will treat as money, not as text. */
const money = (fils: number) => Number((fils / 100).toFixed(2));

const dubaiDay = (at: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);

export async function buildInvoiceWorkbook(
  invoices: InvoiceForExport[],
  meta: { accountName: string; periodLabel: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AussieMed";
  workbook.created = new Date();

  /* ---------------- one row per invoice ---------------- */
  const summary = workbook.addWorksheet("Invoices");
  summary.columns = [
    { header: "Reference", key: "reference", width: 18 },
    { header: "Date", key: "date", width: 12 },
    { header: "Your PO", key: "po", width: 16 },
    { header: "Branch", key: "branch", width: 20 },
    { header: "Ordered by", key: "by", width: 20 },
    { header: "Lines", key: "lines", width: 8 },
    { header: "Net (AED)", key: "net", width: 14 },
    { header: "VAT (AED)", key: "vat", width: 14 },
    { header: "Total (AED)", key: "total", width: 14 },
    { header: "Order status", key: "status", width: 14 },
    { header: "Payment", key: "payment", width: 14 },
  ];

  for (const invoice of invoices) {
    summary.addRow({
      reference: invoice.reference,
      date: dubaiDay(invoice.placedAt),
      po: invoice.poReference ?? "",
      branch: invoice.address?.label ?? invoice.address?.city ?? "",
      by: invoice.staff?.name ?? invoice.placedByName ?? "",
      lines: invoice.items.length,
      net: money(invoice.subtotalFils),
      vat: money(invoice.vatFils),
      total: money(invoice.totalFils),
      status: invoice.status,
      payment: invoice.paymentStatus,
    });
  }

  // A totals row, because the first thing anybody does with this is add it up,
  // and a formula keeps it right if they filter or delete a row.
  if (invoices.length > 0) {
    const first = 2;
    const last = invoices.length + 1;
    const totals = summary.addRow({
      reference: "Total",
      net: { formula: `SUM(G${first}:G${last})` },
      vat: { formula: `SUM(H${first}:H${last})` },
      total: { formula: `SUM(I${first}:I${last})` },
    });
    totals.font = { bold: true };
  }

  /* ---------------- one row per line ---------------- */
  const detail = workbook.addWorksheet("Lines");
  detail.columns = [
    { header: "Reference", key: "reference", width: 18 },
    { header: "Date", key: "date", width: 12 },
    { header: "Item code", key: "sku", width: 18 },
    { header: "Item", key: "name", width: 52 },
    { header: "Pack", key: "unit", width: 20 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Unit price (AED)", key: "unit_price", width: 16 },
    { header: "VAT (AED)", key: "vat", width: 12 },
    { header: "Line total (AED)", key: "total", width: 16 },
    { header: "VAT treatment", key: "tax", width: 16 },
    { header: "Branch", key: "branch", width: 20 },
  ];

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      detail.addRow({
        reference: invoice.reference,
        date: dubaiDay(invoice.placedAt),
        sku: item.skuCodeSnapshot,
        name: item.nameSnapshot,
        unit: item.unitLabelSnapshot,
        qty: item.qty,
        unit_price: money(item.unitPriceFils),
        vat: money(item.vatFils),
        total: money(item.lineTotalFils),
        tax: item.taxClassSnapshot === "ZeroRated" ? "Zero rated" : "Standard 5%",
        branch: invoice.address?.label ?? invoice.address?.city ?? "",
      });
    }
  }

  for (const sheet of [summary, detail]) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    // Auto-filter so a bookkeeper can slice it without setting anything up.
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
  }
  for (const key of ["net", "vat", "total"]) summary.getColumn(key).numFmt = "0.00";
  for (const key of ["unit_price", "vat", "total"]) detail.getColumn(key).numFmt = "0.00";

  /* ---------------- what this is ---------------- */
  const about = workbook.addWorksheet("About");
  about.columns = [{ width: 100 }];
  const trn = invoices.find((i) => i.organisation?.trn)?.organisation?.trn ?? null;

  for (const line of [
    `AussieMed invoices for ${meta.accountName}`,
    `Period: ${meta.periodLabel}`,
    `Downloaded: ${dubaiDay(new Date())} (Asia/Dubai)`,
    `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`,
    "",
    "Net is the amount excluding VAT. VAT is shown separately on every line",
    "and every invoice, because a registered business reclaims it and a figure",
    "that quietly includes it overstates what was actually spent.",
    "",
    "Zero-rated lines carry no VAT and are marked as such in the VAT treatment",
    "column rather than being left out of it.",
    "",
    trn
      ? `Your TRN as we hold it: ${trn}`
      : "We do not hold a TRN for this account, so these are records of what was",
    trn ? "" : "charged rather than compliant UAE tax invoices. Send us your TRN and",
    trn ? "" : "we will reissue them.",
    "",
    "Every invoice also has its own page on the site, which any browser will",
    "save or print as a PDF.",
    "",
    "Questions: info@aussiemed.com",
  ]) {
    about.addRow([line]);
  }
  about.getRow(1).font = { bold: true, size: 14 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
