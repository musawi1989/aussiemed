import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { mailDriverName } from "@/lib/mailer";
import { EmailRetryButton } from "@/components/admin/EmailRetryButton";
import { ComposeEmail } from "@/components/admin/ComposeEmail";
import { recentOrders, recentPurchaseOrders, recipients } from "@/lib/compose";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";

export const metadata: Metadata = {
  title: "Email",
  robots: { index: false, follow: false },
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
 * Everything AussieMed has tried to send.
 *
 * The point of this screen is that a failure is visible. Before BE-05 nothing
 * was sent at all and nothing said so, which is the failure mode worth
 * designing against: silence looks exactly like success.
 *
 * The body is shown in full rather than a template name, because when someone
 * says they were never told, the answer has to be the words that went out.
 */
export default async function AdminEmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();

  const { status } = await searchParams;
  const filter = ["Sent", "Failed", "Suppressed", "Queued"].includes(status ?? "")
    ? status
    : undefined;

  const [people, orders, purchaseOrders] = await Promise.all([
    recipients(),
    recentOrders(),
    recentPurchaseOrders(),
  ]);

  const [emails, counts] = await Promise.all([
    db.outboundEmail.findMany({
      where: filter ? { status: filter } : {},
      orderBy: { queuedAt: "desc" },
      take: 100,
    }),
    db.outboundEmail.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countOf = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  const needsAttention = countOf("Failed") + countOf("Suppressed") + countOf("Queued");

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-text">Email</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Every message AussieMed has tried to send, whether it went or not.
      </p>

      {/* Writing one sits above the record of what has been written. */}
      <div className="mt-5">
        <ComposeEmail
          customers={people.customers}
          suppliers={people.suppliers}
          templates={EMAIL_TEMPLATES.map((t) => ({
            id: t.id,
            label: t.label,
            audience: t.audience,
            needsOrder: t.needsOrder,
          }))}
          orders={orders.map((o) => ({
            value: o.reference,
            label: o.label,
            email: o.email,
          }))}
          purchaseOrders={purchaseOrders.map((p) => ({
            value: p.poNumber,
            label: p.label,
            email: p.email,
          }))}
        />
      </div>

      <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        Driver: <strong className="tnum">{mailDriverName()}</strong>.{" "}
        {mailDriverName() === "outbox"
          ? "Messages are written to the outbox folder instead of being sent, so nothing reaches a real inbox while the catalogue is test data. Set MAIL_DRIVER when a provider is chosen (IN-01)."
          : mailDriverName() === "smtp"
            ? "No SMTP transport is wired up yet, so sends will fail until one is added."
            : "Messages are written to the server log."}
      </p>

      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Filter by status">
        <Chip href="/admin/emails" active={!filter} label="All" count={emails.length && counts.reduce((n, c) => n + c._count._all, 0)} />
        {(["Sent", "Failed", "Suppressed", "Queued"] as const).map((s) => (
          <Chip
            key={s}
            href={`/admin/emails?status=${s}`}
            active={filter === s}
            label={s}
            count={countOf(s)}
            warn={s !== "Sent" && countOf(s) > 0}
          />
        ))}
      </nav>

      {needsAttention === 0 && counts.length > 0 && (
        <p className="mt-4 rounded-card border-l-4 border-success bg-success-soft px-4 py-2.5 text-sm text-text">
          Everything sent. Nothing is queued, failed or suppressed.
        </p>
      )}

      {emails.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing here yet. Messages appear as orders are placed, purchase
          orders are sent, and account changes are decided.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {emails.map((email) => (
            <li
              key={email.id}
              className={`rounded-card border bg-surface p-4 shadow-card ${
                email.status === "Failed"
                  ? "border-danger"
                  : email.status === "Suppressed"
                    ? "border-accent-border"
                    : "border-border-base"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-text">{email.subject}</p>
                  <p className="mt-0.5 text-sm text-text-muted tnum">
                    {email.toAddress || "no address"} &middot; {email.kind}{" "}
                    &middot; {when(email.queuedAt)}
                    {email.attempts > 1 ? ` · ${email.attempts} attempts` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill status={email.status} />
                  {(email.status === "Failed" || email.status === "Queued") && (
                    <EmailRetryButton id={email.id} />
                  )}
                </div>
              </div>

              {email.error && (
                <p className="mt-2 rounded-card border-l-4 border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
                  {email.error}
                </p>
              )}

              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-bold text-navy">
                  What it says
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-card border border-border-base bg-surface-sunken p-3 text-xs leading-relaxed text-text">
                  {email.body}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Sent"
      ? "bg-success-soft text-success"
      : status === "Failed"
        ? "bg-danger-soft text-danger"
        : status === "Suppressed"
          ? "bg-accent-soft text-accent"
          : "bg-surface-sunken text-text-muted";

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}>
      {status}
    </span>
  );
}

function Chip({
  href,
  active,
  label,
  count,
  warn = false,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  warn?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
      <span
        className={`ml-1.5 tnum ${
          warn && !active ? "text-accent" : active ? "" : "text-text-subtle"
        }`}
      >
        {count}
      </span>
    </a>
  );
}
