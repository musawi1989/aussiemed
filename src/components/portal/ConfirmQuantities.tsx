"use client";

import { useActionState, useState } from "react";
import { RestoringForm } from "@/components/AdminForm";
import { confirmQuantitiesAction } from "@/app/business-portal/actions";
import type { FormState } from "@/components/AdminForm";

export type ConfirmLine = {
  id: string;
  code: string;
  name: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
  alreadySent?: number;
};

/**
 * What the supplier can actually send, line by line.
 *
 * Before this they could acknowledge a whole order or say nothing, so "I can
 * do eight of the ten" happened on the phone and never reached the screen the
 * buying run reads.
 *
 * IT OPENS AT THE FULL QUANTITY, not empty. Being able to supply the order is
 * the normal case, so the form starts where most orders end and a supplier who
 * can send everything presses one button. A line they have already answered
 * opens at what they said, not at the full amount, so a saved short answer is
 * never quietly reset to full by reopening the page.
 *
 * A PLUS/MINUS COUNTER ON EVERY LINE, including one-unit lines. The box is
 * still typeable — twenty is faster typed than pressed — but the buttons are
 * what a person reaches for when adjusting by one or two, which is most of the
 * time.
 *
 * Both ends are clamped in the handler rather than left to the input's min and
 * max: those stop the arrows going past, but do nothing about a pasted value.
 */
export function ConfirmQuantities({
  id,
  poNumber,
  lines,
}: {
  id: string;
  poNumber: string;
  lines: ConfirmLine[];
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    confirmQuantitiesAction,
    null
  );

  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      lines.map((l) => [l.id, Math.max(0, (l.qtyConfirmed ?? l.qtyOrdered) - (l.alreadySent ?? 0))])
    )
  );

  const clamp = (line: ConfirmLine, next: number) =>
    Math.max(0, Math.min(line.qtyOrdered - (line.alreadySent ?? 0), Number.isFinite(next) ? next : 0));

  const set = (line: ConfirmLine, next: number) =>
    setValues((prev) => ({ ...prev, [line.id]: clamp(line, next) }));

  const totalOrdered = lines.reduce((n, l) => n + l.qtyOrdered - (l.alreadySent ?? 0), 0);
  const totalSaid = lines.reduce((n, l) => n + (values[l.id] ?? 0), 0);
  const short = totalOrdered - totalSaid;

  return (
    <RestoringForm state={state} action={submit} saveAll className="mt-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="poNumber" value={poNumber} />

      {/*
        No "All of it" button. It filled every line with the ordered quantity,
        which is where the form already opens — so on a fresh order it did
        nothing, and its only remaining use was undoing your own edits. Removed
        at the client's request, 24 Aug 2026.

        The consequence, in case it is ever wanted back: after reducing a line
        there is no one-press way to put it back to full short of holding the
        plus button.
      */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/* Smaller than the table it introduces. It is a running total, not
            the thing being read — the numbers that matter are in the rows. */}
        <span className="ml-auto text-xs tnum text-text-subtle">
          <span className="font-semibold text-text-muted">{totalSaid}</span> of{" "}
          {totalOrdered} units
          {short > 0 && (
            <span className="ml-1.5 font-semibold text-danger">
              &middot; {short} short
            </span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto rounded-card border border-border-base">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead className="border-b border-border-base text-left text-xs font-bold uppercase tracking-wide text-text-subtle">
            <tr>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Still needed</th>
              <th className="px-3 py-2 text-center">You can send</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const value = values[line.id] ?? 0;
              const outstanding = line.qtyOrdered - (line.alreadySent ?? 0);
              const isShort = value < outstanding;

              return (
                <tr key={line.id} className="border-b border-border-base last:border-0">
                  <td className="px-3 py-2">
                    <span className="block font-semibold text-text">{line.name}</span>
                    <span className="block text-xs tnum text-text-subtle">
                      {line.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tnum font-bold text-text">
                    {outstanding}
                  </td>
                  <td className="px-3 py-2">
                    <input type="hidden" name="lineId" value={line.id} />
                    <input type="hidden" name="qtyConfirmed" value={value + (line.alreadySent ?? 0)} />

                    <div className="flex items-center justify-center gap-2">
                      <div className="flex items-center gap-1">
                      <Step
                        label={`One fewer ${line.name}`}
                        disabled={value <= 0}
                        onClick={() => set(line, value - 1)}
                      >
                        &minus;
                      </Step>

                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={outstanding}
                        value={value}
                        onChange={(e) => set(line, Number(e.target.value))}
                        aria-label={`How many ${line.name} you can send, of ${line.qtyOrdered}`}
                        // Red rather than amber, at the client's request of
                        // 24 Aug 2026. It is the danger token the alerts use,
                        // not the brand red, so it moves with the theme and
                        // stays legible on the dark ground.
                        className={`w-16 rounded-card border bg-surface px-2 py-1.5 text-center text-sm tnum text-text ${
                          isShort ? "border-danger" : "border-border-strong"
                        }`}
                      />

                      <Step
                        label={`One more ${line.name}`}
                        disabled={value >= outstanding}
                        onClick={() => set(line, value + 1)}
                      >
                        +
                      </Step>
                      </div>

                      {/*
                        Beside the counter, not under it, and in a slot of a
                        fixed width whether or not it has anything to say.
                        Underneath, the row grew taller the moment a line went
                        short and every row below it jumped down the page —
                        which happens exactly when somebody is pressing minus
                        repeatedly and watching the number.
                      */}
                      <span className="w-16 shrink-0 text-left text-xs font-semibold tnum text-danger">
                        {isShort ? `${outstanding - value} short` : ""}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-card bg-red px-4 py-2 text-sm font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
        >
          {pending ? "Saving…" : "Confirm what you can send"}
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

      <p className="mt-2 text-xs leading-relaxed text-text-subtle">
        Set a line to zero if you cannot send any of it. A short line does not
        cancel anything &mdash; it lets us cover the rest before the order is
        due.
      </p>
    </RestoringForm>
  );
}

/**
 * One end of a counter.
 *
 * Disabled at the limits rather than silently refusing: a button that looks
 * live and does nothing is worse than one that shows it has nothing left to do.
 * type="button" matters — inside a form, a bare button submits it.
 */
function Step({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-8 w-8 shrink-0 cursor-pointer rounded-card border border-border-strong bg-surface text-base font-bold leading-none text-text transition-colors hover:border-navy hover:text-navy disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
