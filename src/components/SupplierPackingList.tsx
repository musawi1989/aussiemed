import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PrintableDoc } from "@/components/PrintableDoc";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export type PackingListLine = {
  supplierPartNumber: string | null;
  skuCode: string;
  name: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
};

export type PackingListPurchaseOrder = {
  poNumber: string;
  supplierName: string;
  cutoffAt: Date;
  sentAt: Date | null;
  expectedAt: Date | null;
  lines: PackingListLine[];
};

/**
 * The sheet a supplier puts in the box when they send us the day's goods.
 *
 * WHY THIS IS NOT THE PURCHASE ORDER. The purchase order is what we asked for.
 * This is what they are actually sending, and the difference between those two
 * numbers is the whole reason goods-in exists. Until now the sorting facility
 * received cartons with whatever paperwork each supplier happened to use — or
 * none — and had to work out what was in them against a purchase order that
 * described an intention rather than a delivery.
 *
 * ONE PER PURCHASE ORDER, WHICH IS ONE PER SUPPLIER PER DAY, because that is
 * how the buying run already pools. So "the daily packing list" and "the
 * packing list for PO-2026-000012" are the same document, and there is no
 * second concept to keep in step.
 *
 * DELIBERATELY PRICELESS, like the picking list and the customer delivery
 * note. It is a counting document handled by warehouse staff on both sides;
 * money on it is noise at best, and this one crosses to another company.
 *
 * NOTHING ABOUT A CUSTOMER APPEARS ON IT — not a name, not an order reference,
 * not a count of customers. That is DEC-24, and it is the model rather than a
 * detail of the layout: pooling the day's demand into one order is precisely
 * what makes it possible. The columns below are ours and theirs only.
 *
 * The right-hand columns print empty on purpose. What they send is theirs to
 * write, and a form we have already filled in is a form nobody checks.
 */
export function SupplierPackingList({
  po,
  backHref,
  /** Ours prints the supplier's name at the top; theirs already knows it. */
  audience,
}: {
  po: PackingListPurchaseOrder;
  backHref: string;
  audience: "admin" | "supplier";
}) {
  const units = po.lines.reduce(
    (n, line) => n + (line.qtyConfirmed ?? line.qtyOrdered),
    0
  );

  return (
    <PrintableDoc
      title={`Packing list · ${po.poNumber}`}
      backHref={backHref}
      backLabel="Back to the purchase order"
    >
      <div className="mt-3 flex flex-wrap justify-between gap-6">
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            {audience === "admin" ? "Expected from" : "Supplier"}
          </p>
          <p className="font-bold text-text">{po.supplierName}</p>
        </div>
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Deliver to
          </p>
          <p className="font-bold text-text">AussieMed &mdash; goods in</p>
          <p className="text-text-muted">Quote the purchase order number below</p>
        </div>
        <div className="text-sm tnum leading-relaxed text-text-muted">
          <p className="font-bold text-text">{po.poNumber}</p>
          <p>Raised {day(po.sentAt)}</p>
          <p>For the run closing {day(po.cutoffAt)}</p>
          {po.expectedAt && <p>Required by {day(po.expectedAt)}</p>}
        </div>
      </div>

      <p className="mt-4 text-sm text-text">
        Please send this sheet with the goods, with the right-hand columns
        completed. It is what our goods-in checks the delivery against, and a
        carton that arrives without it has to be counted twice.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-text-subtle text-left text-xs uppercase tracking-wide text-text-subtle">
              <th scope="col" className="py-1.5 pr-3 font-bold">Your code</th>
              <th scope="col" className="py-1.5 pr-3 font-bold">Description</th>
              <th scope="col" className="py-1.5 pr-3 font-bold">Our code</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Ordered</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Confirmed</th>
              {/* Filled in by them, in the box. */}
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">Sent</th>
              <th scope="col" className="py-1.5 pr-3 font-bold">Batch / lot</th>
              <th scope="col" className="py-1.5 font-bold">Expiry</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line) => (
              <tr key={line.skuCode} className="border-b border-border-base">
                <td className="py-2 pr-3 tnum font-semibold text-text">
                  {line.supplierPartNumber ?? "—"}
                </td>
                <td className="py-2 pr-3 text-text-muted"><ProductThumbnail skuCode={line.skuCode} />{line.name}</td>
                <td className="py-2 pr-3 tnum text-text-subtle">{line.skuCode}</td>
                <td className="py-2 pr-3 text-right tnum text-text-muted">
                  {line.qtyOrdered}
                </td>
                <td className="py-2 pr-3 text-right tnum font-bold text-text">
                  {/* Blank, not zero, where they have not answered. Zero is
                      "none of these, do not wait for them" and putting it here
                      would print a refusal nobody made. */}
                  {line.qtyConfirmed ?? "—"}
                </td>
                <td className="w-16 border-b border-text-subtle py-2 pr-3" />
                <td className="w-28 border-b border-text-subtle py-2 pr-3" />
                <td className="w-24 border-b border-text-subtle py-2" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm tnum text-text-muted">
        {po.lines.length} line{po.lines.length === 1 ? "" : "s"} &middot; {units}{" "}
        unit{units === 1 ? "" : "s"} expected.
      </p>

      <p className="mt-4 rounded-card border-l-4 border-text-subtle bg-surface-sunken px-3 py-2 text-sm text-text">
        <span className="font-bold">Batch and expiry are not optional</span> on
        medical and dental consumables. A recall has to be answerable with which
        deliveries a batch went into, and this sheet is where that starts.
      </p>

      <div className="mt-8 break-inside-avoid rounded-card border border-border-strong p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-text">
          Sent by
        </p>
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <SignatureLine label="Name in capitals" />
          <SignatureLine label="Signature" />
          <SignatureLine label="Date sent" />
          <SignatureLine label="Number of cartons" />
        </div>
      </div>

      <div className="mt-4 break-inside-avoid rounded-card border border-border-strong p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-text">
          Received by AussieMed
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          For our use. Counted against the Sent column above.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
          <SignatureLine label="Checked by" />
          <SignatureLine label="Date received" />
        </div>
      </div>
    </PrintableDoc>
  );
}

/**
 * A ruled line to write on. A bare bottom border rather than a box: a box
 * invites somebody to write inside it and a signature does not fit in one.
 */
function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-10 border-b border-text-subtle" />
      <p className="mt-1 text-[11px] uppercase tracking-wide text-text-subtle">
        {label}
      </p>
    </div>
  );
}
