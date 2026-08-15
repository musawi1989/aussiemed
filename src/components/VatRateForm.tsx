"use client";

import { setVatRateAction } from "@/app/admin/settings/actions";
import { AdminForm, Field, Panel } from "./AdminForm";

export function VatRateForm({ percent }: { percent: number }) {
  return (
    <AdminForm action={setVatRateAction} submitLabel="Save VAT rate">
      <Panel
        title="VAT"
        note="Stored in basis points so it is always an integer: 5% is 500. Every order records the rate in force when it was placed, so changing this cannot rewrite a document a customer already holds."
      >
        <Field
          label="Rate (%)"
          name="percent"
          type="number"
          defaultValue={percent}
          required
          hint="The UAE standard rate is 5%. Zero-rated products are unaffected — AC-02 and AC-05."
        />
      </Panel>
    </AdminForm>
  );
}
