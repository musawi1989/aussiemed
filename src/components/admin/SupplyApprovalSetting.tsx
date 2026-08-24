"use client";

import { useActionState } from "react";
import { setSupplyApprovalAction } from "@/app/admin/settings/actions";
import { Panel, type FormState } from "@/components/AdminForm";

/**
 * Whether a supplier adding an item to their own list needs accepting first.
 *
 * OFF BY DEFAULT, which is the client's decision: a supplier saying "I stock
 * this" is information we want, and making them wait for it teaches them not
 * to bother. On, the same additions arrive unapproved instead.
 *
 * Either way the addition is only an OFFER. It never puts a supplier in line
 * for a purchase order — that is decided on the Cover screen — so the switch
 * governs how quickly we hear about stock, not who gets ordered from. The
 * wording says so, because "approval" invites the opposite assumption.
 */
export function SupplyApprovalSetting({ on }: { on: boolean }) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    setSupplyApprovalAction,
    null
  );

  return (
    <Panel
      title="Suppliers adding their own items"
      note="Suppliers can tell us what they stock from their own portal. This decides whether those additions wait for you."
    >
      <form action={submit} className="flex flex-wrap items-center gap-3">
        {/* The hidden "0" means an unticked box still posts: an absent key is
            indistinguishable from a field that was never rendered. */}
        <input type="hidden" name="enabled" value="0" />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            name="enabled"
            value="1"
            defaultChecked={on}
            className="cursor-pointer"
          />
          Check each addition before it takes effect
        </label>

        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-card border border-border-strong bg-surface px-3 py-1.5 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
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
      </form>

      <p className="mt-3 border-t border-border-base pt-3 text-xs leading-relaxed text-text-subtle">
        An addition is only an offer either way &mdash; it says a supplier can
        supply an item, not that we buy it from them. Who receives the purchase
        order is set on Suppliers &rarr; Cover.
      </p>
    </Panel>
  );
}
