"use client";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/admin/customers/actions";
import { AdminForm, Checkbox, Field, Panel, TextArea } from "./AdminForm";
import { CountryFields } from "@/components/CountryFields";

const INPUT =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const LABEL =
  "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * One form for opening an account and for correcting one, because the rules
 * are identical and two copies would drift — the same reason SupplierForm is
 * shared.
 *
 * There WAS a reason box on the editing form, required, on the reasoning that
 * the audit trail can say what changed but never why. Removed 24 Aug 2026 at
 * the client's request — it stood between an admin and correcting a phone
 * number. The audit trail still records every field before and after, by whom
 * and when. See the note on updateOrganisation.
 */
export function CustomerForm({
  customer,
}: {
  customer?: {
    id: string;
    name: string;
    trn: string | null;
    phone: string | null;
    countryCode: string | null;
    emirate: string | null;
    notes: string | null;
    isDisabled: boolean;
    paymentTerms: string;
  };
}) {
  const editing = Boolean(customer);

  return (
    <AdminForm
      action={editing ? updateCustomerAction : createCustomerAction}
      submitLabel={editing ? "Save account" : "Open account"}
    >
      {customer && <input type="hidden" name="id" value={customer.id} />}

      <Panel title={editing ? "Account" : "New account"}>
        <div className="space-y-4">
          <Field
            label="Account name"
            name="name"
            defaultValue={customer?.name}
            required
            hint="The trading name that goes on their tax invoices."
          />

          <Field
            label="TRN"
            name="trn"
            defaultValue={customer?.trn}
            hint="Tax Registration Number, 15 digits. Leave blank if they are not registered for VAT — a wrong one on an invoice is worse than none."
          />

          {/* Asked rather than assumed, and the same picker every other form
              takes an address with — FE-39. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <CountryFields
              countryCode={customer?.countryCode}
              subdivision={customer?.emirate}
              phone={customer?.phone}
              inputClassName={INPUT}
              labelClassName={LABEL}
            />
          </div>

          <TextArea
            label="Standing notes"
            name="notes"
            defaultValue={customer?.notes}
            rows={3}
            hint="Shown on every order they place — “deliveries before 11am”, “PO number required”. The kind of thing that is otherwise learnt once and forgotten."
          />

          <Checkbox
            label="Account disabled"
            name="isDisabled"
            defaultChecked={customer?.isDisabled}
            hint="Stops them ordering. Their history, branches and people are untouched."
          />
        </div>
      </Panel>
    </AdminForm>
  );
}
