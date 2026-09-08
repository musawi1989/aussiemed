"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState } from "react";
import { pushAllOrdersAction, pushOrderAction } from "@/app/admin/orders/actions";
import type { FormState } from "@/components/AdminForm";

/**
 * Placing orders with suppliers, from the screens where the orders live.
 *
 * WHY HERE AND NOT ONLY IN BUYING. The buying screen thinks in purchase orders
 * — one per supplier, pooled across every customer. That is the right shape
 * for the daily run and the wrong one when somebody is looking at a single
 * clinic on the phone asking when their gloves will ship. On this screen the
 * unit is the customer order, so the button is phrased in those terms and
 * scoped to it.
 *
 * BUILD AND SEND, NOT BUILD. Pressing this on an order and then having to find
 * the resulting draft in another section to send it is most of a job. The
 * confirm text says plainly that it commits, because it does.
 */
function PushButton({
  action,
  fields,
  label,
  confirm,
  className,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  fields?: Record<string, string>;
  label: string;
  confirm: string;
  className: string;
}) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <RestoringForm state={state} saveAll={false}
      action={submit}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      className="inline-flex flex-wrap items-center gap-2"
    >
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={className}>
        {pending ? "Pushing…" : label}
      </button>
      {/*
        The message is long on purpose — it names every purchase order that
        went, and every one that did not with the reason. A push whose result
        is a tick teaches nobody anything on the day it half works.
      */}
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
    </RestoringForm>
  );
}

/** On one customer order, beside the documents it can produce. */
export function PushOrderButton({ reference }: { reference: string }) {
  return (
    <PushButton
      action={pushOrderAction}
      fields={{ reference }}
      label="Push order to suppliers"
      confirm={`Place everything outstanding on ${reference} with its suppliers now? Purchase orders are raised and sent immediately.`}
      className="cursor-pointer rounded-card bg-navy px-3 py-1.5 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
    />
  );
}

/** On the orders list, for the whole outstanding book. */
export function PushAllOrdersButton() {
  return (
    <PushButton
      action={pushAllOrdersAction}
      label="Push all orders to suppliers"
      confirm="Place every outstanding order line with its suppliers now? Purchase orders are raised and sent immediately, without the usual review."
      className="cursor-pointer rounded-card border border-navy bg-surface px-3 py-2 text-sm font-bold text-navy transition-colors hover:bg-navy hover:text-on-navy disabled:opacity-60"
    />
  );
}
