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

  /*
   * ONE QUEUE. Unconfirmed applications used to be parked in a greyed list
   * marked "nothing to do", which was right when the code was the only way in
   * and wrong as soon as an account manager could open an account by hand: a
   * company somebody had already spoken to sat below the fold, undecidable.
   *
   * They are still ordered so the confirmed ones come first — a proved address
   * is the ordinary case — and each unconfirmed card says what approving it
   * would mean.
   */
  const queue = [...applications].sort(
    (a, b) => Number(b.isVerified) - Number(a.isVerified)
  );
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
          {queue.length} waiting for a decision
          {unconfirmed.length > 0
            ? ` · ${unconfirmed.length} with an unconfirmed address`
            : ""}
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="mt-5 rounded-card border border-border-base bg-surface px-4 py-10 text-center text-sm text-text-muted shadow-card">
          Nothing waiting. Applications arrive here as soon as somebody applies,
          whether or not they have confirmed their email address yet.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {queue.map((application) => {
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
                      <Fact label="Email address">
                        {application.isVerified ? (
                          <span className="font-semibold text-success">
                            confirmed
                          </span>
                        ) : (
                          <span className="font-bold text-accent">
                            not confirmed
                          </span>
                        )}
                      </Fact>
                    </dl>
                  </div>
                  <StatusPill status="Pending" axis="record" />
                </div>

                {/*
                  Said at the moment of deciding, not in a report afterwards.
                  Approving is allowed — an account manager who has met the
                  company has already done what the code exists to do — but an
                  approved typo is an account whose owner never receives an
                  order confirmation or an invoice, and nobody finds out until
                  they ring up asking where it is.
                */}
                {!application.isVerified && (
                  <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
                    <span className="font-bold">
                      This address has not been confirmed.
                    </span>{" "}
                    You can still open the account — approving lets them sign in
                    without the code. Check{" "}
                    <span className="font-semibold tnum">
                      {application.email}
                    </span>{" "}
                    is right first: if it is wrong, everything we send them goes
                    nowhere and they will not know.
                  </p>
                )}

                <div className="mt-4 border-t border-border-base pt-4">
                  <ApplicationDecision
                    userId={application.id}
                    companyName={application.organisation?.name ?? "this account"}
                  />
                </div>
              </section>
            );
          })}

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
