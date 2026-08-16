import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  accountBranches,
  accountIdentity,
  accountPendingByTarget,
  accountSession,
} from "@/lib/account";
import {
  AddBranchForm,
  EditBranchForm,
  RemoveBranchButton,
  RenameAccountForm,
} from "@/components/AccountLists";

export const metadata: Metadata = {
  title: "Branches",
  description: "Manage the sites AussieMed delivers to for your account.",
};

/**
 * Branches — the sites a customer takes delivery at.
 *
 * A branch is a delivery address. A practice with three sites does not have
 * three accounts, it has one account and three places goods go, and orders
 * already point at an address, so this is that list with a name on each entry
 * rather than a parallel concept beside it.
 */
export default async function BranchesPage() {
  const session = await accountSession();
  if (!session) redirect("/account");

  const [branches, pending, identity] = await Promise.all([
    accountBranches(),
    accountPendingByTarget(),
    accountIdentity(),
  ]);

  return (
    <>
      <h2 className="text-lg font-bold tracking-tight text-text">Branches</h2>
      <p className="mt-1 max-w-xl text-sm text-text-muted">
        The sites we deliver to. Each order is placed against one of them, so
        you can look at one site&rsquo;s ordering on its own or all of it
        together.
      </p>

      <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        Adding, editing or removing a branch is checked by us before it takes
        effect — it decides where medical supplies are delivered. You will be
        asked why, and it appears on your{" "}
        <Link href="/account/changes" className="font-bold text-navy underline">
          change log
        </Link>{" "}
        either way.
      </p>

      <section className="mt-5">
        {branches.length === 0 ? (
          <p className="rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            No branches yet. Add the first one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {branches.map((branch) => {
              const held = pending.get(branch.id);
              return (
                <li
                  key={branch.id}
                  className="rounded-card border border-border-base bg-surface p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-text">
                        {branch.label ?? branch.city}
                        {branch.isDefault && (
                          <span className="ml-2 rounded-full bg-navy-soft px-2 py-0.5 text-[11px] font-bold text-navy">
                            default
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-sm text-text-muted">
                        {branch.contact}
                        {branch.phone ? ` · ${branch.phone}` : ""}
                      </p>
                      <p className="text-sm text-text-subtle">
                        {[branch.line1, branch.line2, branch.city, branch.emirate]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-xs tnum text-text-subtle">
                        {branch._count.orders}{" "}
                        {branch._count.orders === 1 ? "order" : "orders"}
                      </span>
                      {!held && (
                        <>
                          <EditBranchForm
                            id={branch.id}
                            values={{
                              label: branch.label,
                              contact: branch.contact,
                              phone: branch.phone,
                              line1: branch.line1,
                              line2: branch.line2,
                              city: branch.city,
                              emirate: branch.emirate,
                            }}
                          />
                          <RemoveBranchButton
                            id={branch.id}
                            name={branch.label ?? branch.city}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* The branch says its own change is waiting, rather than
                      leaving the customer to find that out on another page
                      after wondering why their edit did nothing. */}
                  {held && (
                    <p className="mt-3 rounded-card border-l-4 border-accent-border bg-accent-soft px-3 py-2 text-sm text-text">
                      <span className="font-bold">Waiting for approval:</span>{" "}
                      {held.summary}. The details above stay in use until we
                      have checked it.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Add a branch
        </h2>
        <div className="mt-3">
          <AddBranchForm />
        </div>
      </section>

      <section className="mt-6 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Account name
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Currently <strong className="text-text">{identity?.organisationName}</strong>.
        </p>
        <div className="mt-3">
          <RenameAccountForm current={identity?.organisationName ?? ""} />
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        Removing a branch takes it off the list for new orders. Orders already
        delivered there keep it, so your history stays intact.
      </p>
    </>
  );
}
