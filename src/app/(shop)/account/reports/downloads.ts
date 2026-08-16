"use server";

import {
  invoiceForAccount,
  invoicesForPeriod,
} from "@/lib/account-reports";
import { accountIdentity } from "@/lib/account";
import { buildInvoiceWorkbook } from "@/lib/invoice-workbook";
import { periodSlug, resolvePeriod } from "@/lib/periods";

/**
 * Downloads, built on the server and handed back as base64.
 *
 * Not a route, deliberately. A URL anyone could fetch would need its own
 * guard and would be one forgotten check away from serving one clinic's
 * invoices to another; a server action already knows who is asking, and the
 * data layer scopes every query by their session regardless.
 */

export type Download = {
  fileName: string;
  base64: string;
  /** So the caller can say "12 invoices" rather than guessing. */
  count: number;
};

export async function downloadInvoicesAction(input: {
  key?: string;
  from?: string;
  to?: string;
}): Promise<Download | { error: string }> {
  const period = resolvePeriod(input);
  const [invoices, identity] = await Promise.all([
    invoicesForPeriod(period),
    accountIdentity(),
  ]);

  if (invoices.length === 0) {
    return { error: "There are no invoices in that period to download." };
  }

  const workbook = await buildInvoiceWorkbook(invoices, {
    accountName: identity?.organisationName ?? "your account",
    periodLabel: period.label,
  });

  return {
    fileName: `aussiemed-invoices-${periodSlug(period)}.xlsx`,
    base64: workbook.toString("base64"),
    count: invoices.length,
  };
}

export async function downloadOneInvoiceAction(
  reference: string
): Promise<Download | { error: string }> {
  const [invoice, identity] = await Promise.all([
    invoiceForAccount(reference),
    accountIdentity(),
  ]);

  if (!invoice) return { error: "That invoice is not on your account." };

  const workbook = await buildInvoiceWorkbook(
    [
      {
        ...invoice,
        // The single-invoice shape has no branch label beyond what is stored.
        address: invoice.address,
      },
    ],
    {
      accountName: identity?.organisationName ?? "your account",
      periodLabel: invoice.reference,
    }
  );

  return {
    fileName: `aussiemed-invoice-${invoice.reference}.xlsx`,
    base64: workbook.toString("base64"),
    count: 1,
  };
}
