import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { accountSession, accountStaff } from "@/lib/account";
import { AddStaffForm, RemoveStaffButton } from "@/components/AccountLists";

export const metadata: Metadata = {
  title: "Who orders",
  description:
    "Manage the people at your practice who place AussieMed orders, so every order says who placed it.",
};

/**
 * The people who place orders.
 *
 * Names, not logins. The question this answers is "who ordered this?", and
 * answering it does not need passwords, invitations or permissions. Anyone
 * with the account can order; this records which of them did.
 */
export default async function StaffPage() {
  const session = await accountSession();
  if (!session) redirect("/account");

  const staff = await accountStaff();

  return (
    <>
      <h2 className="text-lg font-bold tracking-tight text-text">Who orders</h2>
      <p className="mt-1 max-w-xl text-sm text-text-muted">
        The people at your practice who place orders. At checkout you pick who
        is ordering, and their name goes on the order — so months later it is
        clear who asked for what.
      </p>

      <p className="mt-4 rounded-card border-l-4 border-navy-border bg-navy-soft px-4 py-2.5 text-sm text-text">
        These are names for the record, not logins. Nobody here gets a password
        or their own sign-in.
      </p>

      <section className="mt-5">
        {staff.length === 0 ? (
          <p className="rounded-card border border-border-base bg-surface px-4 py-8 text-center text-sm text-text-muted shadow-card">
            Nobody added yet. Orders will simply not name a person until you do.
          </p>
        ) : (
          <ul className="space-y-2">
            {staff.map((person) => (
              <li
                key={person.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface p-4 shadow-card"
              >
                <div className="min-w-0">
                  <p className="font-bold text-text">{person.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-xs tnum text-text-subtle">
                    {person._count.orders}{" "}
                    {person._count.orders === 1 ? "order" : "orders"}
                  </span>
                  <RemoveStaffButton id={person.id} name={person.name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-card border border-border-base bg-surface p-5 shadow-card">
        <h2 className="text-base font-bold tracking-tight text-text">
          Add someone
        </h2>
        <div className="mt-3">
          <AddStaffForm />
        </div>
      </section>

      <p className="mt-6 text-xs leading-relaxed text-text-subtle">
        Removing someone takes them off the checkout list. The orders they
        placed keep their name.
      </p>
    </>
  );
}
