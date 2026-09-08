import type { Metadata } from "next";
import { SectionTabs } from "@/components/admin/SectionTabs";
import { MessageTemplateEditor } from "@/components/admin/MessageTemplateEditor";
import { listTemplates } from "@/lib/message-templates";
import { EMAIL_TABS } from "../tabs";

export const metadata: Metadata = {
  title: "Automatic messages",
  robots: { index: false, follow: false },
};

const day = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);

/**
 * What every automatic email says, and how to change it.
 *
 * The wording used to live only in code: changing "Thank you — we have your
 * order" meant a developer and a deployment, which is the wrong shape for a
 * sentence the business owns.
 *
 * Each message still has its typed builder with tests over it. Writing your
 * own replaces the subject and body of one of them, rendered from the same
 * values the built-in was given, so {{total}} means what it meant before.
 * Deleting yours puts the original back — that is the whole of the undo.
 *
 * ⚠ NOTHING SAVED HERE IS CHECKED, at the client's instruction — DEC-40. The
 * page says so where somebody is about to type rather than only here.
 */
export default async function AutomaticMessagesPage() {
  const rows = await listTemplates();

  const mine = rows.filter((row) => row.template?.isActive).length;
  const editable = rows.filter((row) => row.overridable).length;

  return (
    <>
      <SectionTabs tabs={EMAIL_TABS} />

      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Automatic messages
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">
          Every email AussieMed sends on its own — to a buyer when an order is
          placed or moves on, and to a supplier when we order from them. Write
          your own wording for any of them, or delete yours to go back to the
          original.
        </p>
        <p className="mt-1 text-sm tnum text-text-muted">
          {editable} message{editable === 1 ? "" : "s"} you can rewrite &middot;{" "}
          {mine === 0 ? "none rewritten yet" : `${mine} using your wording`}
        </p>
      </div>

      <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm text-text">
        <span className="font-bold">Nothing you write here is checked.</span>{" "}
        Wording saved on this page goes out under AussieMed&rsquo;s name exactly
        as typed &mdash; on every order it applies to, until somebody notices.
        In particular nothing stops a message to a buyer naming the supplier a
        product came from, which everywhere else in this system is treated as a
        thing that must not happen. Deleting your version restores the tested
        original.
      </p>

      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <MessageTemplateEditor
            key={row.kind}
            row={{
              kind: row.kind,
              label: row.label,
              audience: row.audience,
              sample: row.sample,
              placeholders: row.placeholders,
              overridable: row.overridable,
              template: row.template
                ? {
                    subject: row.template.subject,
                    body: row.template.body,
                    html: row.template.html,
                    isActive: row.template.isActive,
                    // Formatted here, like every other date on an admin page:
                    // the client would render it in whatever timezone the
                    // person happens to be sitting in.
                    updatedOn: day(row.template.updatedAt),
                    updatedByName: row.template.updatedByName,
                  }
                : null,
            }}
          />
        ))}
      </ul>
    </>
  );
}
