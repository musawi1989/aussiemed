"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  emailNotificationAction,
  markReadAction,
} from "@/app/admin/inbox/actions";
import { FROM_ADDRESS } from "@/lib/email-message";

type Item = {
  id: string;
  kind: string;
  subject: string;
  body: string;
  href: string | null;
  readAt: Date | null;
  emailedAt: Date | null;
  emailedTo: string | null;
  createdAt: Date;
};

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

/**
 * One thing in the inbox, with the option to send it on.
 *
 * The forwarding form shows the exact words that will go out, because they are
 * the words already on the card — nothing is regenerated. Somebody sending a
 * supplier's acknowledgement to a colleague should be able to see what the
 * colleague will read before they send it.
 */
export function InboxItem({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const [readState, markRead] = useActionState(markReadAction, null);
  const [sendState, sendEmail, sending] = useActionState(
    emailNotificationAction,
    null
  );

  const unread = item.readAt === null;

  return (
    <li
      className={`rounded-card border bg-surface p-4 shadow-card ${
        unread ? "border-navy-border" : "border-border-base"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold text-text">
            {unread && (
              <span
                aria-label="Unread"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-navy"
              />
            )}
            {item.subject}
          </p>
          <p className="mt-0.5 text-sm text-text-muted tnum">
            {when(item.createdAt)} &middot; {item.kind}
            {item.emailedAt && item.emailedTo && (
              <span className="ml-2 text-success">
                emailed to {item.emailedTo}
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {item.href && (
            <Link
              href={item.href}
              className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-text transition-colors hover:bg-surface-hover"
            >
              Open
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-card border border-border-strong bg-surface px-3 py-1 text-xs font-bold text-navy transition-colors hover:bg-surface-hover"
          >
            {open ? "Cancel" : "Send as email"}
          </button>

          <form action={markRead}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="read" value={unread ? "yes" : "no"} />
            <button
              type="submit"
              className="rounded-card px-2 py-1 text-xs font-bold text-text-muted transition-colors hover:text-navy"
            >
              {unread ? "Mark read" : "Mark unread"}
            </button>
          </form>
        </div>
      </div>

      <p className="mt-2 whitespace-pre-line border-l-2 border-border-base pl-3 text-sm text-text">
        {item.body}
      </p>

      {open && (
        <form action={sendEmail} className="mt-3 border-t border-border-base pt-3">
          <input type="hidden" name="id" value={item.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                Send to
              </span>
              <input
                name="to"
                type="email"
                required
                defaultValue={
                  (sendState?.ok === false ? sendState.values?.to : undefined) ??
                  item.emailedTo ??
                  FROM_ADDRESS
                }
                className="h-9 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-bold text-text-muted">
                A line from you (optional)
              </span>
              <input
                name="note"
                defaultValue={
                  sendState?.ok === false ? (sendState.values?.note ?? "") : ""
                }
                placeholder="Can you call them this morning?"
                className="h-9 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
              />
            </label>
          </div>

          <p className="mt-2 text-xs text-text-subtle">
            The wording above goes out exactly as it reads, with your line at
            the top. It is recorded under Email like everything else.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={sending}
              className="h-9 rounded-card bg-navy px-4 text-sm font-bold text-on-navy transition-colors hover:bg-navy-hover disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
            </button>

            {sendState?.ok === false && sendState.error && (
              <span role="alert" className="text-sm font-semibold text-danger">
                {sendState.error}
              </span>
            )}
            {sendState?.ok === true && (
              <span role="status" className="text-sm font-semibold text-success">
                {sendState.message}
              </span>
            )}
          </div>
        </form>
      )}

      {readState?.ok === false && readState.error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger">
          {readState.error}
        </p>
      )}
    </li>
  );
}
