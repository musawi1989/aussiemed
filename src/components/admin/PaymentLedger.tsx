import { randomUUID } from "node:crypto";
import { AdminForm, Field, Panel, Select } from "@/components/AdminForm";
import { recordPaymentAction } from "@/app/admin/payments/actions";
import { formatAED } from "@/lib/money";
import type { InvoicePayment } from "@/generated/prisma/client";

export function PaymentLedger({ entity, id, entries, readOnly = false }: {
  entity: "Order" | "PurchaseOrder"; id: string; entries: InvoicePayment[]; readOnly?: boolean;
}) {
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return <Panel title="Payment history">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-border-base"><th className="p-2">Date</th><th className="p-2">Entry</th><th className="p-2 text-right">AED</th><th className="p-2">Recorded by / note</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-border-base align-top">
          <td className="p-2 whitespace-nowrap">{entry.occurredAt ? day(entry.occurredAt) : "Date unavailable"}</td>
          <td className="p-2">{entry.kind === "OpeningBalance" ? "Opening balance" : entry.kind}</td>
          <td className="p-2 text-right whitespace-nowrap">{formatAED(entry.amountFils / 100)}</td>
          <td className="p-2 break-words">{entry.actorName}{entry.note && <p className="mt-1 text-text-muted">{entry.note}</p>}</td>
        </tr>)}</tbody>
      </table>
      {!entries.length && <p className="py-3 text-sm text-text-muted">No payments recorded.</p>}
    </div>
    {!readOnly && <AdminForm key={entries.length} action={recordPaymentAction} submitLabel="Record payment" className="mt-4">
      <input type="hidden" name="entity" value={entity} /><input type="hidden" name="id" value={id} />
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
        <Select name="kind" label="Entry type" options={[{ value: "Payment", label: "Payment" }, { value: "Refund", label: "Refund" }]} />
        <Field name="amount" label="Amount (AED)" type="number" min="0.01" step="0.01" required />
        <Field name="date" label="Payment date" type="date" defaultValue={day(new Date())} max={day(new Date())} required />
      </div>
      <div className="mt-3"><Field name="note" label="Bank reference / note" maxLength={2000} /></div>
    </AdminForm>}
  </Panel>;
}
