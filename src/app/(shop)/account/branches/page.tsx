import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { accountBranches, accountSession } from "@/lib/account";
import { AddBranchForm, RemoveBranchButton } from "@/components/AccountLists";

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

  const branches = await accountBranches();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/account"
        className="text-sm font-semibold text-text-muted hover:text-navy"
      >
        &larr; Your account
      </Link>

      <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
        Branches
      </h1>
      <p className="mt-1 max-w-xl text-sm text-text-muted">
        The sites we deliver to. Each order is placed against one of them, so
        you can look at one site&rsquo;s ordering on its own or all of it
        together.
      </p>

      <section className="mt-6">
        {branches.length === 0 ? (
          <p className="rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            No branches yet. Add the first one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {branches.map((branch) => (
              <li
                key={branch.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
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
                  <RemoveBranchButton
                    id={branch.id}
                    name={branch.label ?? branch.city}
                  />
                </div>
              </li>
            ))}
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

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        Removing a branch takes it off the list for new orders. Orders already
        delivered there keep it, so your history stays intact.
      </p>
    </div>
  );
}
