"use client";

import { setPurchaseOrderPaymentAction } from "@/app/admin/purchasing/actions";
import { AdminForm, Field, Panel, Select } from "@/components/AdminForm";
import { StatusPill } from "@/components/StatusPill";

/**
 * What we have paid this supplier against this order.
 *
 * Money out, tracked apart from goods in. A purchase order can be received in
 * full and unpaid for another month, and one can be paid up front and not yet
 * delivered — collapsing the two into one status makes one of those
 * situations unrepresentable.
 *
 * THE SUPPLIER SEES THE RESULT, which is why the panel says so. It is the one
 * thing on this screen that is not staff-only, and somebody setting it should
 * know that before they set it rather than after.
 *
 * The pill shows the DERIVED status, not the stored one — an invoice past its
 * due date reads Overdue here for the same reason it does on the supplier's
 * own screen, without either of them waiting for a nightly job.
 */
export function PurchaseOrderPayment({
  id,
  paymentStatus,
  derivedStatus,
  paidAED,
  totalAED,
  paymentDueOn,
}: {
  id: string;
  /** The stored word, for the select to open on. */
  paymentStatus: string;
  /** The stored word with time folded in, for the pill. */
  derivedStatus: string;
  paidAED: string;
  totalAED: string;
  paymentDueOn: string;
}) {
  return (
    <Panel
      title="Paying this supplier"
      note="Separate from receiving the goods. The supplier sees this on their own copy of the order."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusPill axis="payment" status={derivedStatus} />
        <span className="tnum text-text-muted">
          {paidAED} paid of {totalAED}
        </span>
      </div>

      <AdminForm
        action={setPurchaseOrderPaymentAction}
        submitLabel="Save payment"
      >
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Status"
            name="paymentStatus"
            defaultValue={paymentStatus}
            options={[
              { value: "Unpaid", label: "Unpaid" },
              { value: "PartiallyPaid", label: "Part paid" },
              { value: "Paid", label: "Paid" },
              { value: "Refunded", label: "Refunded" },
            ]}
          />
          <Field
            label="Paid so far (AED)"
            name="paidAED"
            type="number"
            step="0.01"
            min="0"
            defaultValue={paidAED.replace(/[^\d.]/g, "")}
          />
          <Field
            label="Due on"
            name="paymentDueOn"
            type="date"
            defaultValue={paymentDueOn}
            hint="Leave blank if nobody has agreed a date. Overdue is worked out from this."
          />
        </div>
      </AdminForm>
    </Panel>
  );
}
