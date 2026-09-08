import { ProductThumbnail } from "@/components/ProductThumbnail";
import { PrintableDoc } from "@/components/PrintableDoc";

const day = (d: Date | null) =>
  d ? new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(0, 10) : "—";

export type DocketDocument = {
  poNumber: string;
  supplierName: string;
  cutoffAt: Date;
  sentAt: Date | null;
  expectedAt: Date | null;
  totalDockets: number;
  docket: {
    sequence: number;
    courier: string | null;
    trackingNumber: string | null;
    dispatchedAt: Date | null;
    note: string | null;
    createdAt: Date;
    createdByName: string;
  };
  /** Only the lines actually on this consignment. */
  lines: {
    supplierPartNumber: string | null;
    skuCode: string;
    name: string;
    qtyOrdered: number;
    qty: number;
  }[];
  /** What is still owed after this docket. Empty when it completes the order. */
  toFollow: { name: string; skuCode: string; qty: number }[];
};

/**
 * The paper that travels with one consignment.
 *
 * WHY IT IS NOT THE PACKING LIST. The packing list beside it describes the
 * whole purchase order — everything we asked for, printed before anything is
 * packed. This describes one box: what is in it, and what is not. A supplier
 * sending eight of ten today and two next week produces two of these and one
 * packing list, and the person at goods-in counting the first box needs the
 * document that agrees with what is in front of them.
 *
 * TO FOLLOW IS THE POINT. A short delivery with no paperwork saying it is
 * short is indistinguishable from a wrong one, and the argument that follows
 * happens weeks later over an invoice. Printing what is still owed on the
 * document in the box means both ends agreed at the moment it left.
 */
export function DeliveryDocket({
  doc,
  backHref,
  audience,
}: {
  doc: DocketDocument;
  backHref: string;
  /** Ours names the supplier at the top; theirs already knows who they are. */
  audience: "admin" | "supplier";
}) {
  const units = doc.lines.reduce((n, line) => n + line.qty, 0);
  const outstanding = doc.toFollow.reduce((n, line) => n + line.qty, 0);

  return (
    <PrintableDoc
      title={`Delivery docket ${doc.docket.sequence} · ${doc.poNumber}`}
      backHref={backHref}
      backLabel="Back to the purchase order"
    >
      <div className="mt-3 flex flex-wrap justify-between gap-6">
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            {audience === "admin" ? "Sent by" : "Supplier"}
          </p>
          <p className="font-bold text-text">{doc.supplierName}</p>
        </div>
        <div className="text-sm leading-relaxed">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Deliver to
          </p>
          <p className="font-bold text-text">AussieMed &mdash; goods in</p>
          <p className="text-text-muted">Quote the purchase order number below</p>
        </div>
        <div className="text-sm tnum leading-relaxed text-text-muted">
          <p className="font-bold text-text">{doc.poNumber}</p>
          {/* "2 of 3" only once a third exists — on the day docket 2 is
              raised there is no third, and printing "2 of 2" on it would be a
              claim that the order is finished. */}
          <p>
            Docket {doc.docket.sequence}
            {doc.totalDockets > 1 ? ` of ${doc.totalDockets}` : ""}
          </p>
          <p>Raised {day(doc.docket.createdAt)}</p>
          <p>
            {doc.docket.dispatchedAt
              ? `Despatched ${day(doc.docket.dispatchedAt)}`
              : "Not yet despatched"}
          </p>
          {doc.expectedAt && <p>Required by {day(doc.expectedAt)}</p>}
        </div>
      </div>

      {(doc.docket.courier || doc.docket.trackingNumber) && (
        <p className="mt-3 text-sm tnum text-text-muted">
          {doc.docket.courier && (
            <>
              Courier <span className="font-bold text-text">{doc.docket.courier}</span>
            </>
          )}
          {doc.docket.courier && doc.docket.trackingNumber ? " · " : ""}
          {doc.docket.trackingNumber && (
            <>
              Tracking{" "}
              <span className="font-bold text-text">{doc.docket.trackingNumber}</span>
            </>
          )}
        </p>
      )}

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-text-subtle">
        In this consignment
      </h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead className="border-b border-border-strong text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
          <tr>
            <th className="py-1.5">Code</th>
            <th className="py-1.5">Description</th>
            <th className="py-1.5 pl-6 text-right">Ordered</th>
            <th className="py-1.5 pl-6 text-right">In this box</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((line) => (
            <tr key={line.skuCode} className="border-b border-border-base last:border-0">
              <td className="py-2 tnum font-semibold text-text">
                <ProductThumbnail skuCode={line.skuCode} />{line.supplierPartNumber ?? line.skuCode}
              </td>
              <td className="py-2 text-text-muted">{line.name}</td>
              <td className="py-2 pl-6 text-right tnum text-text-muted">
                {line.qtyOrdered}
              </td>
              <td className="py-2 pl-6 text-right tnum font-bold text-text">
                {line.qty}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border-strong">
            <td colSpan={3} className="py-2 text-right text-xs font-bold uppercase tracking-wide text-text-subtle">
              Units in this consignment
            </td>
            <td className="py-2 pl-6 text-right tnum font-bold text-text">{units}</td>
          </tr>
        </tfoot>
      </table>

      {doc.toFollow.length > 0 ? (
        <>
          <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-danger">
            To follow &mdash; not in this consignment
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            {outstanding} unit{outstanding === 1 ? "" : "s"} still owed against
            this purchase order. A further docket will accompany them.
          </p>
          <table className="mt-2 w-full border-collapse text-sm">
            <tbody>
              {doc.toFollow.map((line) => (
                <tr key={line.skuCode} className="border-b border-border-base last:border-0">
                  <td className="py-1.5 tnum font-semibold text-text"><ProductThumbnail skuCode={line.skuCode} />{line.skuCode}</td>
                  <td className="py-1.5 text-text-muted">{line.name}</td>
                  <td className="py-1.5 pl-6 text-right tnum font-bold text-danger">
                    {line.qty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="mt-6 text-sm font-bold text-text">
          This consignment completes the purchase order. Nothing further to follow.
        </p>
      )}

      {doc.docket.note && (
        <div className="mt-6 border-t border-border-base pt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-text-subtle">
            Note
          </p>
          <p className="mt-1 text-sm text-text">{doc.docket.note}</p>
        </div>
      )}

      <p className="mt-6 text-xs text-text-subtle">
        Raised by {doc.docket.createdByName}. Checked against purchase order{" "}
        {doc.poNumber} for the run closing {day(doc.cutoffAt)}.
      </p>
    </PrintableDoc>
  );
}
