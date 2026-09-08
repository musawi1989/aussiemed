import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { mailDriverName } from "@/lib/mailer";
import { EmailRetryButton } from "@/components/admin/EmailRetryButton";
import { StatusPill } from "@/components/StatusPill";
import { ComposeEmail } from "@/components/admin/ComposeEmail";
import { recentOrders, recentPurchaseOrders, recipients } from "@/lib/compose";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";
import { EmailTemplates } from "@/components/admin/EmailTemplates";
import { listSavedTemplates, PLACEHOLDERS } from "@/lib/saved-templates";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { EMAIL_TABS } from "./tabs";
import { AdminForm } from "@/components/AdminForm";
import { HtmlEditor } from "@/components/admin/HtmlEditor";
import { saveSignatureAction } from "./actions";

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
  searchParams: Promise<{ status?: string; to?: string; q?: string }>;
}) {
  const actor = await requireAdmin("email", "view");
  const signature = await db.user.findUnique({ where: { id: actor.id }, select: { emailSignatureHtml: true } });

  const { status, to, q } = await searchParams;
  const filter = ["Sent", "Failed", "Suppressed", "Queued"].includes(status ?? "")
    ? status
    : undefined;

  /*
   * Who it was written for, which is a different question from who it was
   * addressed to. audience is recorded on the row at send time and is what the
   * leak checks run against, so filtering on it answers "show me everything
   * that went to suppliers" without a guess about the address.
   */
  const audience = ["Customer", "Supplier", "Staff"].includes(to ?? "")
    ? to
    : undefined;

  const term = (q ?? "").trim();

  /*
   * Searched across the address, the subject AND the body.
   *
   * The body is the point. Somebody says they were never told their order
   * shipped; the useful search is the order number, and that appears in the
   * words that went out rather than in the subject line. The whole reason this
   * screen shows full bodies is the same reason it searches them.
   */
  const where = {
    ...(filter ? { status: filter } : {}),
    ...(audience ? { audience } : {}),
    ...(term
      ? {
          OR: [
            { toAddress: { contains: term } },
            { subject: { contains: term } },
            { body: { contains: term } },
            { entityId: { contains: term } },
          ],
        }
      : {}),
  };

  // Keeps every other filter while changing one, so narrowing by supplier and
  // then by failed does not silently drop the first choice.
  const linkWith = (change: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status: filter, to: audience, q: term || undefined, ...change };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const query = next.toString();
    return query ? `/admin/emails?${query}` : "/admin/emails";
  };

  const [people, orders, purchaseOrders, saved] = await Promise.all([
    recipients(),
    recentOrders(),
    recentPurchaseOrders(),
    listSavedTemplates(),
  ]);

  const [emails, counts] = await Promise.all([
    db.outboundEmail.findMany({
      where,
      orderBy: { queuedAt: "desc" },
      take: 100,
      include: { attachments: { select: { id: true, fileName: true } } },
    }),
    db.outboundEmail.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // Counted against everything EXCEPT the audience filter, so the chips still
  // say how many suppliers there are while suppliers are being looked at.
  const audienceCounts = await db.outboundEmail.groupBy({
    by: ["audience"],
    _count: { _all: true },
    where: {
      ...(filter ? { status: filter } : {}),
      ...(term
        ? {
            OR: [
              { toAddress: { contains: term } },
              { subject: { contains: term } },
              { body: { contains: term } },
              { entityId: { contains: term } },
            ],
          }
        : {}),
    },
  });
  const audienceCount = (a: string) =>
    audienceCounts.find((c) => c.audience === a)?._count._all ?? 0;

  const countOf = (s: string) =>
    counts.find((c) => c.status === s)?._count._all ?? 0;

  const needsAttention = countOf("Failed") + countOf("Suppressed") + countOf("Queued");

  return (
    <div className="px-4 py-6 lg:px-8">
      <SectionTabs tabs={EMAIL_TABS} />

      <h1 className="mt-6 text-xl font-bold tracking-tight text-text">Email</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Every message AussieMed has tried to send, whether it went or not. What
        the automatic ones say is on the next tab.
      </p>

      {/* Writing one sits above the record of what has been written. */}
      <div className="mt-5">
        <ComposeEmail
          customers={people.customers}
          suppliers={people.suppliers}
          templates={[
            ...EMAIL_TEMPLATES.map((t) => ({
              id: t.id,
              label: t.label,
              audience: t.audience,
              needsOrder: t.needsOrder,
            })),
            /*
             * Yours, after the built-in ones and marked as yours.
             *
             * The "saved:" prefix is what keeps the two id spaces apart — a
             * template named the same as a built-in cannot shadow it, and the
             * drafting code resolves the prefix rather than guessing.
             */
            ...saved.map((t) => ({
              id: `saved:${t.id}`,
              label: `${t.name} (yours)`,
              audience: t.audience,
              needsOrder: t.needsOrder,
            })),
          ]}
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

      {/* Managing the wording sits under the form that uses it, and above the
          log of what has actually gone out. */}
      <details className="mt-5 border-y border-border-base py-3">
        <summary className="cursor-pointer text-sm font-semibold text-text">My email signature</summary>
        <AdminForm action={saveSignatureAction} submitLabel="Save signature">
          <HtmlEditor name="emailSignatureHtml" label="My signature" defaultValue={signature?.emailSignatureHtml} />
        </AdminForm>
      </details>
      <EmailTemplates
        templates={saved.map((t) => ({
          id: t.id,
          name: t.name,
          audience: t.audience,
          subject: t.subject,
          body: t.body,
          html: t.html,
          needsOrder: t.needsOrder,
          // Formatted on the server like every other date here, so it does not
          // render in whatever timezone the reader happens to be sitting in.
          updatedAt: t.updatedAt.toISOString().slice(0, 10),
          updatedByName: t.updatedByName,
        }))}
        placeholders={PLACEHOLDERS}
      />

      <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        Driver: <strong className="tnum">{mailDriverName()}</strong>.{" "}
        {mailDriverName() === "outbox"
          ? "Messages are written to the outbox folder instead of being sent, so nothing reaches a real inbox while the catalogue is test data. Set MAIL_DRIVER when a provider is chosen (IN-01)."
          : mailDriverName() === "smtp"
            ? "No SMTP transport is wired up yet, so sends will fail until one is added."
            : "Messages are written to the server log."}
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-2">
        {/* The other filters ride along, so searching does not clear them. */}
        {filter && <input type="hidden" name="status" value={filter} />}
        {audience && <input type="hidden" name="to" value={audience} />}
        <label className="min-w-[14rem] flex-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-text-subtle">
            Search
          </span>
          <input
            name="q"
            defaultValue={term}
            placeholder="Address, subject, order number, or anything in the message"
            className="mt-1 w-full rounded-card border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:border-navy focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-[38px] rounded-card border border-border-strong bg-surface px-4 text-sm font-bold text-text transition-colors hover:border-navy hover:text-navy"
        >
          Search
        </button>
        {term && (
          <a
            href={linkWith({ q: undefined })}
            className="h-[38px] px-2 text-sm font-semibold leading-[38px] text-text-muted hover:text-navy"
          >
            Clear
          </a>
        )}
      </form>

      <nav className="mt-4 flex flex-wrap gap-1.5" aria-label="Filter by status">
        <Chip href={linkWith({ status: undefined })} active={!filter} label="All" count={counts.reduce((n, c) => n + c._count._all, 0)} />
        {(["Sent", "Failed", "Suppressed", "Queued"] as const).map((s) => (
          <Chip
            key={s}
            href={linkWith({ status: s })}
            active={filter === s}
            label={s}
            count={countOf(s)}
            warn={s !== "Sent" && countOf(s) > 0}
          />
        ))}
      </nav>

      <nav className="mt-2 flex flex-wrap gap-1.5" aria-label="Filter by who it went to">
        <Chip href={linkWith({ to: undefined })} active={!audience} label="Everyone" count={audienceCounts.reduce((n, c) => n + c._count._all, 0)} />
        {(["Customer", "Supplier", "Staff"] as const).map((a) => (
          <Chip
            key={a}
            href={linkWith({ to: a })}
            active={audience === a}
            label={a === "Customer" ? "Customers" : a === "Supplier" ? "Suppliers" : "Us"}
            count={audienceCount(a)}
          />
        ))}
      </nav>

      {(term || audience) && (
        <p className="mt-3 text-xs text-text-muted tnum">
          {emails.length}
          {emails.length === 100 ? "+ (showing the first 100)" : ""} match
          {emails.length === 1 ? "es" : ""}
          {term ? ` "${term}"` : ""}
          {audience ? ` · to ${audience.toLowerCase()}s` : ""}.{" "}
          <a href="/admin/emails" className="font-semibold text-navy hover:underline">
            Clear everything
          </a>
        </p>
      )}

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
                  <StatusPill axis="record" status={email.status} />
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
                {email.html && <iframe title={`Email preview: ${email.subject}`} sandbox="" referrerPolicy="no-referrer"
                  srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><body>${email.html}</body>`}
                  className="mt-3 h-80 w-full border border-border-base bg-white" />}
                {email.attachments.length > 0 && <ul className="mt-3 space-y-1 text-sm">{email.attachments.map(file => <li key={file.id}>
                  <a download href={`/admin/emails/attachments/${file.id}`} className="break-all font-semibold text-navy underline">{file.fileName}</a>
                </li>)}</ul>}
              </details>
            </li>
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
