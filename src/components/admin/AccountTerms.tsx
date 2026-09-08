"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { setAccountTermsAction } from "@/app/admin/customers/terms-actions";
import { Panel, type FormState } from "@/components/AdminForm";
import { discountLabel } from "@/lib/customer-terms";
import { PaymentTermsPicker } from "@/components/PaymentTermsPicker";

const TERMS = [
  { value: "Prepaid", label: "Prepaid — payable before dispatch" },
  { value: "Net7", label: "Net 7 — 7 days" },
  { value: "Net14", label: "Net 14 — two weeks" },
  { value: "Net30", label: "Net 30 — 30 days" },
  { value: "Net60", label: "Net 60 — 60 days" },
];

/**
 * What this account has been agreed: a discount off list, and when they pay.
 *
 * ONE FORM FOR BOTH, because they are one conversation. An account is offered
 * a rate and terms in the same meeting, and saving half of it is how the two
 * end up disagreeing with what was actually agreed.
 *
 * The discount is typed as a percentage and stored as basis points. Nobody
 * negotiates "250 basis points off", and nothing should store 2.5 as a float —
 * customer-terms.ts does that conversion, once, with tests.
 */
export function AccountTerms({
  id,
  discountBasisPoints,
  paymentTerms,
}: {
  id: string;
  discountBasisPoints: number;
  paymentTerms: string;
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setAccountTermsAction,
    null,
  );

  // The stored figure back as a percentage, so the box shows what is in force
  // rather than an empty field that reads as "no discount".
  const current = discountBasisPoints
    ? (discountBasisPoints / 100).toString()
    : "";

  return (
    <Panel
      title="Agreed terms"
      note="What this account pays and when. Both apply to every order they place from now on — nothing already placed is repriced."
    >
      <RestoringForm state={state} saveAll={true} action={submit} className="space-y-4">
        <input type="hidden" name="id" value={id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
              Account discount
            </span>
            <span className="mt-1 flex items-center gap-2">
              <input
                name="discountPercent"
                defaultValue={current}
                inputMode="decimal"
                placeholder="0"
                className="w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm tnum text-text focus:border-navy focus:outline-none"
              />
              <span className="shrink-0 text-sm font-bold text-text-muted">
                %
              </span>
            </span>
            <span className="mt-1 block text-xs text-text-subtle">
              Off list, on everything except items with an agreed price below.
              Two decimal places. Leave blank for none &mdash; currently{" "}
              <span className="font-semibold text-text">
                {discountLabel(discountBasisPoints)}
              </span>
              .
            </span>
          </label>

          <PaymentTermsPicker value={paymentTerms} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="cursor-pointer rounded-card bg-navy px-4 py-2 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save terms"}
          </button>

          {state?.ok === false && state.error && (
            <span role="alert" className="text-xs font-semibold text-danger">
              {state.error}
            </span>
          )}
          {state?.ok === true && state.message && (
            <span role="status" className="text-xs font-semibold text-success">
              {state.message}
            </span>
          )}
        </div>
      </RestoringForm>

      {/* Said on screen rather than left for somebody to wonder about. AC-09
          is still open and a limit entered before the policy exists is a
          figure that gets believed. */}
      <p className="mt-4 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        Credit limit is still deliberately absent &mdash; it is an accounting
        decision that has not been taken (AC-09). Terms set here decide when an
        invoice falls due, not how much they may owe at once.
      </p>
    </Panel>
  );
}
