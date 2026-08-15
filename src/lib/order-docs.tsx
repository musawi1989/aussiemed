import "server-only";

import { notFound } from "next/navigation";
import { db } from "./db";
import { formatAED } from "./money";

/**
 * The data behind the three order documents, loaded once and shared.
 *
 * A picking list, a delivery note and a tax invoice are three readings of the
 * same order, and the fastest way to get them out of step is to query for each
 * of them separately.
 */
export const aed = (fils: number) => formatAED(fils / 100);
export const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export async function loadOrderForDocs(reference: string) {
  const order = await db.order.findUnique({
    where: { reference },
    include: {
      user: { select: { name: true, email: true, phone: true } },
      organisation: {
        select: { name: true, trn: true, emirate: true, paymentTerms: true },
      },
      invoices: {
        orderBy: { invoiceNumber: "asc" },
        include: {
          supplier: {
            select: { companyName: true, trn: true, primaryEmail: true, address: true },
          },
          items: { orderBy: { nameSnapshot: "asc" } },
        },
      },
    },
  });

  if (!order) notFound();
  return order;
}

/** The seller's own details. Placeholders until LG-06 and AC-03 are answered. */
export function SellerBlock() {
  return (
    <div className="text-sm leading-relaxed text-text-muted">
      <p className="font-bold text-text">AussieMed</p>
      <p>United Arab Emirates</p>
      <p className="mt-1 text-xs text-danger">
        Company registration and TRN not supplied — LG-06 and AC-03. This
        document is not a compliant UAE tax invoice until they are.
      </p>
    </div>
  );
}

export function DocTable({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
