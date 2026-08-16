"use client";

import {
  createSupplierAction,
  updateSupplierAction,
} from "@/app/admin/suppliers/actions";
import { AdminForm, Field, Panel, Select } from "./AdminForm";

/**
 * One form for creating and editing, because the rules are identical and two
 * copies would drift.
 *
 * The second email is required and marked so. Both addresses receive order
 * notifications: a supplier with one contact is a supplier whose orders go
 * unread while that person is away.
 */
export function SupplierForm({
  supplier,
}: {
  supplier?: {
    id: string;
    companyName: string;
    primaryEmail: string;
    secondaryEmail: string;
    phone: string | null;
    address: string | null;
    trn: string | null;
    status: string;
    promisedLeadTimeDays?: number | null;
    ackSlaHours?: number | null;
  };
}) {
  const editing = Boolean(supplier);

  return (
    <AdminForm
      action={editing ? updateSupplierAction : createSupplierAction}
      submitLabel={editing ? "Save supplier" : "Create supplier"}
    >
      {supplier && <input type="hidden" name="id" value={supplier.id} />}

      <Panel title={editing ? "Supplier" : "New supplier"}>
        <div className="space-y-4">
          <Field
            label="Company name"
            name="companyName"
            defaultValue={supplier?.companyName}
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Primary email"
              name="primaryEmail"
              type="email"
              defaultValue={supplier?.primaryEmail}
              required
              hint="Receives order notifications."
            />
            <Field
              label="Second email"
              name="secondaryEmail"
              type="email"
              defaultValue={supplier?.secondaryEmail}
              required
              hint="Also receives every notification. Required, and must differ from the first."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" name="phone" defaultValue={supplier?.phone} />
            <Field
              label="TRN"
              name="trn"
              defaultValue={supplier?.trn}
              hint="Tax Registration Number. Suppliers may invoice in their own name."
            />
          </div>

          <Field label="Address" name="address" defaultValue={supplier?.address} />

          {/* What they have promised, agreed at onboarding — BE-33. Blank is
              allowed and means not agreed: an on-time rate measured against a
              target nobody set is a number with no meaning, so the reports
              show "no target agreed" instead of inventing one. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Promised lead time (days)"
              name="promisedLeadTimeDays"
              defaultValue={
                supplier?.promisedLeadTimeDays == null
                  ? ""
                  : String(supplier.promisedLeadTimeDays)
              }
              hint="Days from our order to their despatch, as agreed with them. Leave blank if nothing has been agreed — on-time figures stay blank rather than guessing."
            />
            <Field
              label="Acknowledgement window (hours)"
              name="ackSlaHours"
              defaultValue={
                supplier?.ackSlaHours == null ? "" : String(supplier.ackSlaHours)
              }
              hint="How quickly they should confirm a purchase order. Defaults to 24 hours."
            />
          </div>

          <Select
            label="Status"
            name="status"
            defaultValue={supplier?.status ?? "Active"}
            options={[
              { value: "Active", label: "Active" },
              { value: "Suspended", label: "Suspended" },
            ]}
            hint="Suspending hides the supplier from the storefront. Its products and invoices are untouched."
          />
        </div>
      </Panel>
    </AdminForm>
  );
}
