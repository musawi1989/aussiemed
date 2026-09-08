import type { Metadata } from "next";
import Link from "next/link";
import { ChangeDecision } from "@/components/admin/ChangeDecision";
import { changeDetail, pendingChanges } from "@/lib/account-changes";
import {
  attentionItems,
  GROUP_BLURBS,
  GROUP_LABELS,
} from "@/lib/attention";
import { EnquiryQueues } from "@/components/admin/EnquiryQueues";

export const metadata: Metadata = {
  title: "Needs attention",
  robots: { index: false, follow: false },
};

const when = (d: Date) =>
  `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;

const daysSince = (d: Date) =>
  Math.floor((Date.now() - d.getTime()) / 86_400_000);

/**
 * What needs a person today.
 *
 * Two halves, because they are two different jobs. The top is every queue in
 * the back office as a count and a link — the thing that was missing was not
 * another list of rows, it was knowing which screen to open. The bottom is the
 * one queue that lives here: account changes a customer has asked for and
 * cannot have until somebody says yes.
 */
export default async function ApprovalsPage() {
  const [queues, changes] = await Promise.all([
    attentionItems(),
    pendingChanges(),
  ]);

  // Read alongside the requests so a reviewer sees what actually differs
  // rather than seven address lines of which one has moved.
  const details = await Promise.all(
    changes.map(async (change) => ({
      id: change.id,
      diff: (await changeDetail(change.id))?.diff ?? [],
    }))
  );
  const diffs = new Map(details.map((d) => [d.id, d.diff]));

  const live = queues.filter((q) => q.count > 0);

  /**
   * Grouped, in the order somebody works them.
   *
   * A decision blocks a person outside the business, so it comes first. An
   * order we cannot fill is a phone call worth making today. Everything else
   * is ours and waits on nobody. An empty group is dropped rather than shown
   * as a heading with nothing under it.
   */
  const sections = (["decide", "sell", "do"] as const)
    .map((group) => ({
      group,
      label: GROUP_LABELS[group],
      blurb: GROUP_BLURBS[group],
      items: live.filter((q) => q.group === group),
    }))
    .filter((section) => section.items.length > 0);

  /**
   * One of these queues is this page.
   *
   * Its card pointed at /admin/approvals, which is where the reader already
   * is, so clicking it did nothing at all — it looked like a broken link
   * because it behaved like one. It jumps to the section below instead, and
   * says so, rather than pretending to go somewhere.
   */
  /*
   * Several of these queues are now this page.
   *
   * Account changes always lived here; the enquiry queues joined them when
   * Enquiries was removed from the nav. A card pointing at the page the reader
   * is already on did nothing at all and looked like a broken link, so it
   * jumps to the section instead — to the card's OWN fragment where it names
   * one, which is what stops three different cards all landing on the same
   * heading.
   */
  const HERE = "/admin/approvals";
  const hrefFor = (href: string) => {
    if (!href.startsWith(HERE)) return href;
    const hash = href.indexOf("#");
    return hash === -1 ? "#account-changes" : href.slice(hash);
  };
  const isOnThisPage = (href: string) => href.startsWith(HERE);

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-text">
        Needs attention
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-text-muted">
        Every queue in the back office with something in it, and the account
        changes waiting on a decision.
      </p>

      {live.length === 0 ? (
        <p className="mt-6 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted shadow-card">
          Nothing is waiting. Every queue is empty.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.group} className="mt-7">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
              {section.label}{" "}
              <span className="tnum text-text-muted">
                ({section.items.reduce((n, q) => n + q.count, 0)})
              </span>
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs text-text-muted">
              {section.blurb}
            </p>

            <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {section.items.map((queue) => (
                <li key={queue.key}>
                  <Link
                    href={hrefFor(queue.href)}
                    className={`flex h-full flex-col rounded-card border bg-surface p-4 shadow-card transition-colors hover:border-navy ${
                      queue.urgent ? "border-accent-border" : "border-border-base"
                    }`}
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-bold text-text">
                        {queue.label}
                        {isOnThisPage(queue.href) && (
                          <span className="ml-1.5 text-xs font-normal text-text-subtle">
                            &darr; below
                          </span>
                        )}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold tnum ${
                          queue.urgent
                            ? "bg-accent text-surface"
                            : "bg-surface-sunken text-text-muted"
                        }`}
                      >
                        {queue.count}
                      </span>
                    </span>
                    <span className="mt-1 text-xs leading-relaxed text-text-muted">
                      {queue.detail}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* scroll-mt keeps the heading clear of the top of the window when the
          card above jumps to it. */}
      <section id="account-changes" className="mt-8 scroll-mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-subtle">
          Account changes to approve{" "}
          <span className="tnum text-text-muted">({changes.length})</span>
        </h2>

        {changes.length === 0 ? (
          <p className="mt-2 rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            No account changes are waiting. Customers can manage who orders on
            their own; branches and account names come here first.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {changes.map((change) => {
              const diff = diffs.get(change.id) ?? [];
              const age = daysSince(change.requestedAt);

              return (
                <li
                  key={change.id}
                  className="rounded-card border border-border-base bg-surface p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-text">{change.summary}</p>
                      <p className="mt-0.5 text-sm text-text-muted tnum">
                        {/* No per-customer screen to link to yet — the admin
                            customers page is a list. Naming the account is
                            what the reviewer needs either way. */}
                        <span className="font-bold text-text">
                          {change.organisation.name}
                        </span>{" "}
                        &middot; {change.requestedByName} &middot;{" "}
                        {when(change.requestedAt)}
                      </p>
                    </div>
                    {/* Age, not a date, on anything that has been sat on. A
                        customer cannot order to a branch that is still here. */}
                    {age >= 1 && (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tnum ${
                          age >= 2
                            ? "bg-danger-soft text-danger"
                            : "bg-accent-soft text-accent"
                        }`}
                      >
                        waiting {age} {age === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 border-l-2 border-border-base pl-3 text-sm text-text">
                    <span className="font-bold">Their reason: </span>
                    {change.reason}
                  </p>

                  {diff.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[26rem] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border-base text-left text-xs uppercase tracking-wide text-text-subtle">
                            <th scope="col" className="py-1.5 pr-4 font-bold">
                              Field
                            </th>
                            <th scope="col" className="py-1.5 pr-4 font-bold">
                              Now
                            </th>
                            <th scope="col" className="py-1.5 font-bold">
                              Asked for
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.map((row) => (
                            <tr
                              key={row.label}
                              className="border-b border-border-base last:border-0"
                            >
                              <td className="py-1.5 pr-4 font-semibold text-text-muted">
                                {row.label}
                              </td>
                              <td className="py-1.5 pr-4 text-text-subtle">
                                {row.from || "—"}
                              </td>
                              <td className="py-1.5 font-semibold text-text">
                                {row.to || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {change.kind === "BranchRemoved" && (
                    <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
                      Approving archives this branch. Orders already delivered
                      there keep it.
                    </p>
                  )}

                  <ChangeDecision changeId={change.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Below account changes, because those block somebody outside the
          business from doing anything and these are people waiting on a
          price. Renders nothing at all when all three queues are empty. */}
      <EnquiryQueues />
    </div>
  );
}
