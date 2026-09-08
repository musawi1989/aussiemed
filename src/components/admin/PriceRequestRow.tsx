"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import {
  approvePriceAction,
  rejectPriceAction,
} from "@/app/admin/suppliers/prices/actions";
import type { PriceRequest } from "@/lib/supply-pricing";
import { rankLabel } from "@/lib/ranks";
import type { FormState } from "@/components/AdminForm";

/** Cost is held in fils. Always the English string AED, always 2 decimals. */
const aed = (fils: number | null) =>
  fils === null ? "not recorded" : `AED ${(fils / 100).toFixed(2)}`;

/**
 * One supplier's request to be paid differently.
 *
 * The old price, the new price and the movement between them are the whole
 * decision, so they are the largest thing on the row. A 4% rise on a backup
 * line and a 40% rise on the primary for a product we sell daily are not the
 * same question, and a table that showed only "AED 21.40" would make them look
 * like it.
 */
export function PriceRequestRow({ request }: { request: PriceRequest }) {
  const [rejecting, setRejecting] = useState(false);

  const [approveState, approve, approving] = useActionState(
    approvePriceAction,
    null
  );
  const [rejectState, reject, pendingReject] = useActionState(
    rejectPriceAction,
    null
  );

  const up = request.changePercent !== null && request.changePercent > 0;

  return (
    <li className="rounded-card border border-border-base bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">{request.productName}</p>
          <p className="text-xs text-text-muted">
            {request.skuCode} · {request.unitLabel}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            <span className="font-semibold text-text">
              {request.supplierName}
            </span>
            {request.rank ? (
              <span className="ml-1.5 rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy">
                {rankLabel(request.rank)}
              </span>
            ) : (
              <span className="ml-1.5 text-text-subtle">offer only</span>
            )}
          </p>
        </div>

        <div className="text-right">
          <p className="text-xs text-text-muted">
            <span className="line-through">{aed(request.agreedFils)}</span>
            <span className="mx-1.5">&rarr;</span>
            <span className="text-lg font-bold text-text">
              {aed(request.proposedFils)}
            </span>
          </p>
          {request.changePercent !== null && (
            <p
              className={`text-xs font-bold ${up ? "text-danger" : "text-success"}`}
            >
              {up ? "+" : ""}
              {request.changePercent}% {up ? "increase" : "decrease"}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-text-subtle">
            asked {request.proposedAt.toISOString().slice(0, 10)}
            {request.proposedByName ? ` by ${request.proposedByName}` : ""}
          </p>
        </div>
      </div>

      {request.reason ? (
        <p className="mt-3 rounded-card bg-surface-sunken px-3 py-2 text-sm text-text-muted">
          &ldquo;{request.reason}&rdquo;
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-text-subtle">
          No reason given.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <RestoringForm state={approveState} saveAll={false} action={approve}>
          <input type="hidden" name="supplyId" value={request.supplyId} />
          <button
            type="submit"
            disabled={approving || pendingReject}
            className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
          >
            {approving ? "Agreeing…" : "Agree to this price"}
          </button>
        </RestoringForm>

        {!rejecting && (
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={approving}
            className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
          >
            Decline
          </button>
        )}

        <Feedback state={approveState} />
        {!rejecting && <Feedback state={rejectState} />}
      </div>

      {/* Revealed rather than always shown: the reason is required, and an
          empty box beside every row invites somebody to fill it in and then
          click the wrong button. */}
      {rejecting && (
        <RestoringForm state={rejectState} saveAll={false} action={reject} className="mt-3">
          <input type="hidden" name="supplyId" value={request.supplyId} />
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-text">
              Why are you declining?
            </span>
            <textarea
              name="note"
              rows={2}
              required
              minLength={3}
              placeholder="Held to the agreed price until the annual review."
              className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-2 text-xs text-text"
            />
          </label>
          <p className="mt-1 text-[11px] text-text-subtle">
            The supplier can ask again. Without a reason they have nothing to
            answer, and the next thing that happens is a phone call.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={pendingReject}
              className="rounded-card bg-red px-3 py-1.5 text-xs font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
            >
              {pendingReject ? "Declining…" : "Decline this request"}
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-xs font-bold text-text-muted hover:underline"
            >
              Cancel
            </button>
            <Feedback state={rejectState} />
          </div>
        </RestoringForm>
      )}
    </li>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="text-xs font-semibold text-success">
        {state.message ?? "Saved."}
      </p>
    );
  }
  return null;
}
