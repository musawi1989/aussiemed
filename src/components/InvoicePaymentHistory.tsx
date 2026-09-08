import { formatAED } from "@/lib/money";

export type PublicPayment = { id: string; occurredAt: Date | null; kind: string; amountFils: number; reference?: string };
export function InvoicePaymentHistory({ entries }: { entries: PublicPayment[] }) {
  return <section className="mt-6 border-t border-border-base pt-4">
    <h2 className="text-base font-bold text-text">Payment history</h2>
    {entries.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-border-base"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Entry</th><th className="py-2 text-right">Amount (AED)</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id} className="border-b border-border-base">
        <td className="py-2 pr-3 whitespace-nowrap">{entry.occurredAt ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "2-digit", month: "short", year: "numeric" }).format(entry.occurredAt) : "Date unavailable"}</td>
        <td className="py-2 pr-3">{entry.kind === "OpeningBalance" ? "Opening balance" : entry.kind}{entry.reference && <span className="block text-xs text-text-muted">{entry.reference}</span>}</td>
        <td className="py-2 text-right whitespace-nowrap tnum">{formatAED(entry.amountFils / 100)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="mt-2 text-sm text-text-muted">No payments recorded.</p>}
  </section>;
}
