import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WithdrawChangeButton } from "@/components/AccountLists";
import { StatusPill } from "@/components/StatusPill";
import { accountChangeLog, accountSession } from "@/lib/account";

export const metadata: Metadata = {
  title: "Account changes",
  description:
    "Every change made to your AussieMed account, who made it, why, and whether it is waiting for approval.",
};

const when = (d: Date) =>
  `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;

/**
 * Everything that has been changed on this account.
 *
 * One timeline rather than a log and a separate queue: the question is the
 * same either way — what has been changed here, by whom, and why — and two
 * lists would mean checking both to answer it.
 *
 * The reason is shown at the same weight as the change itself, because the
 * reason is the part that cannot be reconstructed from the data. The database
 * will always be able to say a branch was removed; only this can say the
 * clinic closed.
 */
export default async function AccountChangesPage() {
  const session = await accountSession();
  if (!session) redirect("/account");

  const changes = await accountChangeLog();
  const waiting = changes.filter((c) => c.status === "Pending");

  return (
    <>
      <h2 className="text-lg font-bold tracking-tight text-text">
        Account changes
      </h2>
      <p className="mt-1 max-w-xl text-sm text-text-muted">
        Everything that has been changed on this account, who changed it and
        why. Changes to branches and to your account name are checked by us
        first; changes to who orders take effect straight away.
      </p>

      {waiting.length > 0 && (
        <p className="mt-4 rounded-card border-l-4 border-accent-border bg-accent-soft px-4 py-2.5 text-sm font-semibold text-text tnum">
          {waiting.length} {waiting.length === 1 ? "change is" : "changes are"}{" "}
          waiting for approval.
        </p>
      )}

      {changes.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-12 text-center text-sm text-text-muted shadow-card">
          Nothing has been changed on this account yet. When someone adds a
          branch or changes who orders, it appears here with their reason.
        </p>
      ) : (
        <ol className="mt-5 space-y-2">
          {changes.map((change) => (
            <li
              key={change.id}
              className="rounded-card border border-border-base bg-surface p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-text">{change.summary}</p>
                  <p className="mt-0.5 text-sm text-text-muted tnum">
                    {when(change.requestedAt)} &middot; {change.requestedByName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusPill axis="record" status={change.status} />
                  {change.status === "Pending" && (
                    <WithdrawChangeButton id={change.id} />
                  )}
                </div>
              </div>

              <p className="mt-2 border-l-2 border-border-base pl-3 text-sm text-text">
                {change.reason}
              </p>

              {/* Our answer, when there is one. A refusal that arrives without
                  a reason is worse than no answer at all. */}
              {change.reviewedAt && (
                <p className="mt-2 text-sm text-text-muted">
                  <span className="font-bold text-text">
                    {change.status === "Rejected"
                      ? "Not approved"
                      : "Approved"}
                  </span>{" "}
                  by {change.reviewedByName ?? "AussieMed"} on{" "}
                  <span className="tnum">
                    {change.reviewedAt.toISOString().slice(0, 10)}
                  </span>
                  {change.decisionNote ? ` — ${change.decisionNote}` : ""}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

