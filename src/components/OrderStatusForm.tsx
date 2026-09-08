"use client";

import { setOrderStatusAction } from "@/app/admin/orders/actions";
import { AdminForm, Select } from "./AdminForm";

/**
 * Order status is one-way past Delivered and Cancelled: both are closed
 * documents the customer already holds, and a status that contradicts what
 * they received is worse than no status at all. The service layer refuses the
 * transition; this form explains why before anyone tries.
 */
export function OrderStatusForm({
  reference,
  status,
  statuses,
}: {
  reference: string;
  status: string;
  statuses: string[];
}) {
  const closed = status === "Delivered" || status === "Cancelled";

  if (closed) {
    return (
      <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-xs leading-relaxed text-text-muted">
        {status === "Delivered"
          ? "Delivered orders cannot be moved back. Raise a return instead."
          : "Cancelled orders cannot be reopened. Place a new order."}
      </p>
    );
  }

  return (
    <AdminForm action={setOrderStatusAction} submitLabel="Update status" className="mt-3" confirmChange={data => ["Cancelled", "Delivered"].includes(String(data.get("status"))) ? `Mark ${reference} as ${data.get("status")}? This closes the order and cannot be undone here.` : null}>
      <input type="hidden" name="reference" value={reference} />
      <Select
        label="Move to"
        name="status"
        defaultValue={status}
        options={statuses.map((s) => ({ value: s, label: s }))}
        hint="Delivered and Cancelled are final."
      />
    </AdminForm>
  );
}
