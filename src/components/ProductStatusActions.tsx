"use client";

import { setStatusAction } from "@/app/admin/products/[id]/actions";
import { AdminForm, Select } from "./AdminForm";
import { StatusPill } from "./StatusPill";

/**
 * Approval, kept away from the edit form.
 *
 * Making a product Active is the moment it becomes buyable — a different kind
 * of decision from correcting a description, and one a supplier may never
 * make. The rule is enforced in the service layer; this panel just refuses to
 * pretend the button will work when the product is not ready.
 */
export function ProductStatusActions({
  productId,
  status,
  statuses,
  hasActiveSku,
  hasCategory,
}: {
  productId: string;
  status: string;
  statuses: string[];
  hasActiveSku: boolean;
  hasCategory: boolean;
}) {
  const blockers = [
    !hasActiveSku && "it has no active SKU, so there is nothing to buy",
    !hasCategory && "it has no category, so nobody can browse to it",
  ].filter(Boolean) as string[];

  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">Status</h2>
      <p className="mt-2">
        <StatusPill axis="record" status={status} />
      </p>

      {blockers.length > 0 && (
        <p className="mt-3 rounded-card bg-accent-soft px-3 py-2 text-xs leading-relaxed text-text">
          This cannot go live yet: {blockers.join(", and ")}.
        </p>
      )}

      <AdminForm action={setStatusAction} submitLabel="Change status" className="mt-3" confirmChange={data => data.get("status") !== status ? `Change this product to ${data.get("status")}? This changes its storefront availability.` : null}>
        <input type="hidden" name="id" value={productId} />
        <Select
          label="Move to"
          name="status"
          defaultValue={status}
          options={statuses.map((s) => ({
            value: s,
            label: s === "PendingApproval" ? "Pending approval" : s,
          }))}
          hint="Only an admin can move a product to Active. Suppliers can submit for approval but never approve their own."
        />
      </AdminForm>
    </section>
  );
}
