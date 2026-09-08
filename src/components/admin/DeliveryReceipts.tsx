"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useRef } from "react";
import {
  addDeliveryReceiptAction,
  removeDeliveryReceiptAction,
} from "@/app/admin/orders/[reference]/receipt-actions";
import type { FormState } from "@/components/AdminForm";

export type ReceiptView = {
  id: string;
  fileName: string;
  receivedByName: string | null;
  receivedOn: string | null;
  note: string | null;
  uploadedAt: string;
  uploadedByName: string;
};

const field =
  "mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none";
const label =
  "block text-xs font-bold uppercase tracking-wide text-text-subtle";

/**
 * The signed sheet, back from the driver.
 *
 * MORE THAN ONE IS NORMAL, so this is a list that grows rather than a single
 * slot that overwrites. Two doors on two days, or a receipt photographed in
 * three pages, and the earlier one is still the evidence.
 *
 * Who signed and when are typed in beside the file rather than left inside the
 * image. "Did anyone sign for AM-2026-000022" should be answerable from the
 * screen; a photograph makes that a question you have to open something to
 * answer, and nothing can search it later.
 */
export function DeliveryReceipts({
  reference,
  receipts,
}: {
  reference: string;
  receipts: ReceiptView[];
}) {
  const [state, submit, saving] = useActionState<FormState, FormData>(
    addDeliveryReceiptAction,
    null
  );
  const form = useRef<HTMLFormElement>(null);

  return (
    <section className="rounded-card border border-border-base bg-surface p-5 shadow-card">
      <h2 className="text-base font-bold tracking-tight text-text">
        Delivery receipt
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">
        The signed delivery note back from the driver. Kept where only staff can
        open it &mdash; it carries somebody&rsquo;s signature.
      </p>

      {receipts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {receipts.map((receipt) => (
            <li
              key={receipt.id}
              className="rounded-card border border-border-base bg-surface-sunken px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <a
                  href={`/admin/orders/${reference}/receipt/${receipt.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-bold text-navy underline hover:no-underline"
                >
                  {receipt.fileName}
                </a>
                <RemoveReceipt id={receipt.id} name={receipt.fileName} />
              </div>

              <p className="mt-0.5 text-xs text-text-muted">
                {receipt.receivedByName ? (
                  <>
                    Signed by{" "}
                    <span className="font-semibold text-text">
                      {receipt.receivedByName}
                    </span>
                    {receipt.receivedOn ? ` on ${receipt.receivedOn}` : ""}
                  </>
                ) : (
                  <span className="text-text-subtle">No name recorded</span>
                )}
              </p>

              {receipt.note && (
                <p className="mt-1 text-xs text-text">{receipt.note}</p>
              )}

              <p className="mt-1 text-[11px] text-text-subtle tnum">
                Added {receipt.uploadedAt} by {receipt.uploadedByName}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={form}
        action={async (data) => {
          submit(data);
          // Cleared after sending rather than left holding the last file: the
          // next receipt is a different delivery, and a file input that still
          // shows the previous name invites uploading it twice.
          form.current?.reset();
        }}
        className="mt-3 space-y-3 border-t border-border-base pt-3"
      >
        <input type="hidden" name="reference" value={reference} />

        <label className="block">
          <span className={label}>Scan or photograph</span>
          <input
            type="file"
            name="file"
            required
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="mt-1 w-full text-sm text-text file:mr-3 file:cursor-pointer file:rounded-card file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-text"
          />
          <span className="mt-1 block text-[11px] text-text-subtle">
            PDF, JPEG, PNG or WebP, up to 8 MB.
          </span>
        </label>

        <label className="block">
          <span className={label}>Signed by</span>
          <input
            name="receivedByName"
            placeholder="As written on the sheet"
            className={field}
          />
        </label>

        <label className="block">
          <span className={label}>Date on the signature</span>
          <input type="date" name="receivedOn" className={field} />
          <span className="mt-1 block text-[11px] text-text-subtle">
            What they wrote, which need not be today.
          </span>
        </label>

        <label className="block">
          <span className={label}>Note</span>
          <input
            name="note"
            placeholder="Left at reception, one box short…"
            className={field}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
          >
            {saving ? "Uploading…" : "Add receipt"}
          </button>
          {state?.ok === false && (
            <span role="alert" className="text-xs font-semibold text-danger">
              {state.error}
            </span>
          )}
          {state?.ok === true && (
            <span role="status" className="text-xs font-semibold text-success">
              {state.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Its own form, so one failing removal cannot clear the upload box above it. */
function RemoveReceipt({ id, name }: { id: string; name: string }) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    removeDeliveryReceiptAction,
    null
  );

  return (
    <RestoringForm state={state} saveAll={false} action={submit}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(event) => {
          // Asks, because the file goes with the row and there is no undo.
          // This is the evidence that the goods arrived.
          if (!window.confirm(`Remove ${name}? The file is deleted with it.`)) {
            event.preventDefault();
          }
        }}
        className="text-[11px] font-bold text-danger hover:underline disabled:opacity-60"
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {state?.ok === false && (
        <span role="alert" className="ml-2 text-[11px] font-semibold text-danger">
          {state.error}
        </span>
      )}
    </RestoringForm>
  );
}
