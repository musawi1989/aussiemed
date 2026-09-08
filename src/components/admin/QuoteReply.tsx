"use client";

import { RestoringForm } from "@/components/AdminForm";
import { useActionState, useState } from "react";
import { replyToQuoteAction } from "@/app/admin/bulk-buy/actions";
import type { FormState } from "@/components/AdminForm";

const dubaiDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));

/**
 * The answer to a bulk buy request, written and sent from the same box.
 *
 * Collapsed until asked for: the common case on this screen is reading the
 * queue, and an always-open textarea under every request turns it into a wall
 * of forms.
 *
 * ⚠ ANSWERING IS NOT FINISHING. This box sends a price and leaves the request
 * open; the button beneath it is what says the conversation is over. They are
 * separate posts so that neither can trigger the other — see the section page.
 *
 * THE SEND IS A CHOICE, AND ITS DEFAULT CHANGES. On a first answer the box is
 * ticked, because the reason somebody is typing here is to tell a customer a
 * price. On an edit it is clear, because the common edit is a correction to
 * the record — a spelling, a note about what was agreed on the phone
 * afterwards — and a second email arriving with substantially the first email
 * in it makes us look like we cannot keep track of what we have quoted. When a
 * revised price genuinely needs sending, one tick sends it.
 *
 * The address is printed on the button's own label rather than left implied.
 * The one mistake this screen can make that cannot be taken back is sending a
 * price to the wrong person, and the moment to notice is while looking at the
 * thing that says who it is going to.
 */
export function QuoteReply({
  quoteId,
  contactEmail,
  reply,
  answeredBy,
  answeredAt,
}: {
  quoteId: string;
  contactEmail: string;
  reply: string | null;
  answeredBy: string | null;
  /** ISO, because a Date cannot cross into a client component. */
  answeredAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(replyToQuoteAction, null);

  if (reply && !open) {
    return (
      <div className="mt-2 rounded-card border-l-4 border-navy-border bg-navy-soft px-3 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-navy">
            Answered{answeredBy ? ` by ${answeredBy}` : ""}
            {answeredAt ? ` · ${dubaiDay(answeredAt)}` : ""} — sent to{" "}
            {contactEmail}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[11px] font-bold text-navy hover:underline"
          >
            Edit or resend
          </button>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm text-text">{reply}</p>
        <Feedback state={state} />
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-card border border-border-strong bg-surface px-3 py-1.5 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
        >
          Answer this request
        </button>
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <RestoringForm state={state} saveAll={false} action={submit} className="mt-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      <label className="block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-subtle">
          Your answer — sent to the customer as written
        </span>
        <textarea
          name="reply"
          rows={6}
          required
          minLength={3}
          defaultValue={state?.values?.reply ?? reply ?? ""}
          placeholder={
            "We can do the gauze swabs at AED 18.40 a box and the transfer pipettes at AED 42.00 a pack of 500.\n\n" +
            "That holds for 30 days and includes delivery anywhere in Dubai. At 100 boxes or more there is a further 4% off the swabs."
          }
          className="w-full rounded-card border border-border-strong bg-surface px-2.5 py-2 text-sm text-text"
        />
      </label>
      <p className="mt-1 text-[11px] text-text-subtle">
        Prices, what they include and how long they hold. This goes out word for
        word under AussieMed&rsquo;s name, so write it as you would say it. Do
        not name the supplier a price came from.
      </p>

      <label className="mt-2 flex items-start gap-2">
        <input
          type="checkbox"
          name="sendEmail"
          defaultChecked={!reply}
          className="mt-0.5 h-4 w-4 shrink-0 accent-navy"
        />
        <span className="text-xs text-text">
          <span className="font-bold">Email this to {contactEmail}</span>
          <span className="block text-[11px] text-text-subtle">
            {reply
              ? "Off by default on an edit — tick it only if this revision should go to them as a new email."
              : "Leave it off to record what was quoted without sending anything."}
          </span>
        </span>
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
        >
          {pending ? "Sending…" : reply ? "Save the answer" : "Send the answer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-bold text-text-muted hover:underline"
        >
          Cancel
        </button>
        <Feedback state={state} />
      </div>
    </RestoringForm>
  );
}

function Feedback({ state }: { state: FormState }) {
  if (state?.ok === false && state.error) {
    return (
      <p role="alert" className="mt-1 text-xs font-semibold text-danger">
        {state.error}
      </p>
    );
  }
  if (state?.ok === true) {
    return (
      <p role="status" className="mt-1 text-xs font-semibold text-success">
        {state.message ?? "Sent."}
      </p>
    );
  }
  return null;
}
