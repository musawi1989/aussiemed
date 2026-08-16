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
      // Flat. An order is no longer split by supplier — AussieMed is the
      // seller of record (DEC-22) and the customer never learns a supplier
      // was involved (DEC-24), so these three documents describe one order.
      items: { orderBy: { nameSnapshot: "asc" } },
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
  /**
   * A long product name would otherwise take the whole table, squeezing the
   * item code below the width of its own heading — the codes then read as part
   * of the description, and a figure breaks as "AED" above "84.58". Headings
   * and every figure hold their line; only the description wraps, which is the
   * one column that should. Cells sit at the top so a code stays level with the
   * first line of the name it belongs to.
   */
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm [&_.tnum]:whitespace-nowrap [&_td]:align-top [&_th]:whitespace-nowrap">
        <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
