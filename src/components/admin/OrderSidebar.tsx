"use client";

import { AdminForm, Field, Select, TextArea } from "@/components/AdminForm";
import { CourierPicker } from "@/components/CourierPicker";
import {
  setDeliveryAction,
  setInternalNotesAction,
  setOrderStatusAction,
  setPaymentAction,
} from "@/app/admin/orders/[reference]/actions";

/**
 * The right-hand column of the order screen: status, payment, delivery, notes.
 *
 * Each is its own form because each fails for its own reason, and because
 * these are the four things different people touch — the warehouse sets
 * delivery, accounts sets payment, and neither should have to re-submit the
 * other's work to save their own.
 */
export function OrderSidebar({
  reference,
  status,
  statuses,
  payment,
  paymentStatuses,
  delivery,
  courierOptions,
  internalNotes,
  closed,
}: {
  reference: string;
  status: string;
  statuses: readonly string[];
  payment: {
    paymentStatus: string;
    paidAED: string;
    totalAED: string;
    paymentDueOn: string;
    overdue: boolean;
  };
  paymentStatuses: readonly string[];
  delivery: {
    deliveryType: string;
    courier: string;
    trackingNumber: string;
    estimatedShipmentOn: string;
  };
  /** From courierOptions() on the server. Empty falls back to a text box. */
  courierOptions: string[];
  internalNotes: string;
  closed: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Fulfilment
        </h2>
        {closed ? (
          <p className="mt-2 rounded-card bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text-muted">
            {status === "Delivered"
              ? "Delivered orders cannot be moved back. Raise a return instead."
              : "Cancelled orders cannot be reopened. Place a new order."}
          </p>
        ) : (
          <AdminForm
            action={setOrderStatusAction}
            submitLabel="Update status"
            className="mt-2"
          >
            <input type="hidden" name="reference" value={reference} />
            <Select
              label="Move to"
              name="status"
              defaultValue={status}
              options={statuses.map((s) => ({ value: s, label: s }))}
              hint="Delivered and Cancelled are final. Individual lines have their own status."
            />
          </AdminForm>
        )}
      </section>

      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">Payment</h2>
        {payment.overdue && (
          <p className="mt-2 rounded-card bg-danger-soft px-3 py-2 text-xs font-bold text-danger">
            Past its due date and not settled.
          </p>
        )}
        <AdminForm action={setPaymentAction} submitLabel="Save payment" className="mt-2">
          <input type="hidden" name="reference" value={reference} />
          <div className="space-y-3">
            <Select
              label="Status"
              name="paymentStatus"
              defaultValue={payment.paymentStatus}
              options={paymentStatuses.map((s) => ({
                value: s,
                label: s === "PartiallyPaid" ? "Partially paid" : s,
              }))}
              hint="Marking it Paid stamps the moment and settles it in full."
            />
            <Field
              label="Received so far (AED)"
              name="paidAED"
              type="number"
              defaultValue={payment.paidAED}
              hint={`Order total ${payment.totalAED}. Used for part payments on credit accounts.`}
            />
            <Field
              label="Due on"
              name="paymentDueOn"
              type="date"
              defaultValue={payment.paymentDueOn}
              hint="Set from the account's terms when the order is placed. Clearing it removes the due date."
            />
          </div>
        </AdminForm>
      </section>

      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">Delivery</h2>
        <AdminForm action={setDeliveryAction} submitLabel="Save delivery" className="mt-2">
          <input type="hidden" name="reference" value={reference} />
          <div className="space-y-3">
            <Select
              label="Type"
              name="deliveryType"
              defaultValue={delivery.deliveryType}
              options={[
                { value: "Delivery", label: "Delivery" },
                { value: "PickUp", label: "Pick up" },
              ]}
            />
            <Field
              label="Ship by"
              name="estimatedShipmentOn"
              type="date"
              defaultValue={delivery.estimatedShipmentOn}
              hint="What the warehouse is working to. Filterable from the orders list."
            />
            <CourierPicker
              value={delivery.courier}
              options={courierOptions}
              labelClassName="block text-xs font-bold uppercase tracking-wide text-text-subtle"
              inputClassName="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
            />
            <Field
              label="Tracking number"
              name="trackingNumber"
              defaultValue={delivery.trackingNumber}
            />
          </div>
        </AdminForm>
      </section>

      <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Internal notes
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Staff only. The customer never sees this.
        </p>
        <AdminForm
          action={setInternalNotesAction}
          submitLabel="Save note"
          className="mt-2"
        >
          <input type="hidden" name="reference" value={reference} />
          <TextArea
            label="Note"
            name="internalNotes"
            defaultValue={internalNotes}
            rows={3}
          />
        </AdminForm>
      </section>
    </div>
  );
}
