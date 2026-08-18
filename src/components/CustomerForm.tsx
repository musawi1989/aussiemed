"use client";

import {
  createCustomerAction,
  updateCustomerAction,
} from "@/app/admin/customers/actions";
import { AdminForm, Checkbox, Field, Panel, TextArea } from "./AdminForm";
import { CountryFields } from "@/components/CountryFields";

const INPUT =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const LABEL = "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * One form for opening an account and for correcting one, because the rules
 * are identical and two copies would drift — the same reason SupplierForm is
 * shared.
 *
 * The difference is the reason box, which appears only when editing. A new
 * account needs no explanation; changing somebody else's does, and it is the
 * one thing about a change that cannot be reconstructed from the data later.
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

      {editing && (
        <Panel title="Why">
          <div className="space-y-4">
            <TextArea
              label="Reason for this change"
              name="reason"
              rows={2}
              hint="Goes on the audit trail, and on the customer's own change log if the account name moves. At least 10 characters."
            />
          </div>
        </Panel>
      )}

      <Panel title="Not set here">
        <p className="text-sm leading-relaxed text-text-muted">
          Payment terms and credit limit are deliberately absent. They are an
          accounting decision that has not been taken yet (AC-09), and a figure
          entered before the policy exists is a figure that gets believed. New
          accounts open on{" "}
          <span className="font-semibold text-text">
            {customer?.paymentTerms ?? "Prepaid"}
          </span>{" "}
          with no credit until then.
        </p>
      </Panel>
    </AdminForm>
  );
}
