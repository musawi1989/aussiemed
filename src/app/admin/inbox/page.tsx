import type { Metadata } from "next";
import Link from "next/link";
import { InboxItem } from "@/components/admin/InboxItem";
import { MarkAllRead } from "@/components/admin/MarkAllRead";
import { inbox, unreadCount } from "@/lib/notifications";
import { mailDriverName } from "@/lib/mailer";

export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

/**
 * Things that happened, in the order they happened.
 *
 * Deliberately not the same screen as Needs attention. That one counts what is
 * outstanding right now and goes back to zero when the work is done; this one
 * keeps the record. An order arriving is not a task, but it is worth knowing
 * about, and a queue that only shows unfinished work has nowhere to put it.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string }>;
}) {
  const { unread } = await searchParams;
  const unreadOnly = unread === "1";

  const [items, count] = await Promise.all([
    inbox({ unreadOnly }),
    unreadCount(),
  ]);

  return (
    <div className="px-4 py-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text">Inbox</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-muted tnum">
            {count === 0
              ? "Nothing unread."
              : `${count} unread. `}
            Anything here can be sent on to somebody as an email.
          </p>
        </div>

        {count > 0 && <MarkAllRead />}
      </div>

      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Filter">
        <Chip href="/admin/inbox" active={!unreadOnly} label="Everything" />
        <Chip
          href="/admin/inbox?unread=1"
          active={unreadOnly}
          label={`Unread${count > 0 ? ` (${count})` : ""}`}
        />
      </nav>

      {mailDriverName() === "outbox" && (
        <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
          Email is going to the outbox folder rather than to real inboxes while
          the catalogue is test data. Everything sent is readable under{" "}
          <Link href="/admin/emails" className="font-bold text-navy underline">
            Email
          </Link>
          .
        </p>
      )}

      {items.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          {unreadOnly
            ? "Nothing unread. Everything here has been seen."
            : "Nothing yet. Orders, approval requests and supplier acknowledgements appear here as they happen."}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <InboxItem
              key={item.id}
              item={{
                id: item.id,
                kind: item.kind,
                subject: item.subject,
                body: item.body,
                href: item.href,
                readAt: item.readAt,
                emailedAt: item.emailedAt,
                emailedTo: item.emailedTo,
                createdAt: item.createdAt,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
    </Link>
  );
}
