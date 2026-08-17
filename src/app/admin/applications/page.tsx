import { pendingApplications } from "@/lib/applications";
import { ApplicationDecision } from "@/components/admin/ApplicationDecision";
import { StatusPill } from "@/components/StatusPill";
import { countryName } from "@/lib/geo";
import { formatTrn, isRealTrn } from "@/lib/trn";

/**
 * Trade account applications waiting on a person.
 *
 * Everything needed to decide is on the card, because the decision is "do we
 * trade with these people" and that is answered by reading the company name,
 * the TRN and where they are — not by clicking into three screens.
 *
 * Unconfirmed applications are shown separately and greyed. They may be a
 * mistyped address rather than a real business, and they are not worth a
 * person's attention until the applicant has proved the address reaches them.
 */
export default async function ApplicationsPage() {
  const applications = await pendingApplications();

  const ready = applications.filter((a) => a.isVerified);
  const unconfirmed = applications.filter((a) => !a.isVerified);

  const day = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Dubai",
          day: "2-digit",
          month: "short",
          year: "numeric",
        }).format(d)
      : "—";

  return (
    <>
      <div className="mt-6">
        <h1 className="text-xl font-bold tracking-tight text-text">
          Account applications
        </h1>
        <p className="mt-1 text-sm text-text-muted tnum">
          {ready.length} waiting for a decision
          {unconfirmed.length > 0
            ? ` · ${unconfirmed.length} not yet confirmed their email`
            : ""}
        </p>
      </div>

      {ready.length === 0 && unconfirmed.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted shadow-card">
          Nothing waiting. Applications arrive here once somebody has confirmed
          their email address.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {ready.map((application) => {
            const trn = application.organisation?.trn;
            return (
              <section
                key={application.id}
                className="rounded-card border border-border-base bg-surface p-5 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-bold text-text">
                      {application.organisation?.name ?? "—"}
                    </h2>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {application.name} &middot; {application.email}
                    </p>
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      <Fact label="TRN">
                        <span className="tnum">
                          {formatTrn(trn) ?? "not given"}
                        </span>
                        {/* A placeholder TRN on a real application is worth
                            seeing before approving: it means the number cannot
                            be invoiced against. */}
                        {trn && !isRealTrn(trn) && (
                          <span className="ml-1.5 font-bold text-danger">
                            placeholder
                          </span>
                        )}
                      </Fact>
                      <Fact label="Country">
                        {countryName(application.organisation?.countryCode) ??
                          "—"}
                      </Fact>
                      <Fact label="Phone">
                        <span className="tnum">{application.phone ?? "—"}</span>
                      </Fact>
                      <Fact label="Applied">{day(application.appliedAt)}</Fact>
                    </dl>
                  </div>
                  <StatusPill status="Pending" axis="record" />
                </div>

                <div className="mt-4 border-t border-border-base pt-4">
                  <ApplicationDecision
                    userId={application.id}
                    companyName={application.organisation?.name ?? "this account"}
                  />
                </div>
              </section>
            );
          })}

          {unconfirmed.length > 0 && (
            <section className="rounded-card border border-border-base bg-surface-sunken p-5">
              <h2 className="text-sm font-bold text-text">
                Not yet confirmed their email
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Nothing to do. These may be mistyped addresses, and they appear
                above once the code has been entered.
              </p>
              <ul className="mt-3 space-y-1.5">
                {unconfirmed.map((a) => (
                  <li key={a.id} className="text-sm text-text-muted">
                    {a.organisation?.name ?? "—"} &middot; {a.email}
                    <span className="ml-2 text-xs text-text-subtle tnum">
                      {day(a.appliedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-bold uppercase tracking-wide text-text-subtle">
        {label}
      </dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}
