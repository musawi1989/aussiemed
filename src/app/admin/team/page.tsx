import type { Metadata } from "next";
import Link from "next/link";
import { AdminTeam } from "@/components/admin/AdminTeam";
import { ADMIN_PERMISSIONS } from "@/lib/admin-permissions";
import { currentAdmin, listAdmins } from "@/lib/admin-team";

export const metadata: Metadata = {
  title: "Admin team",
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
 * The master admin's console: who works in the back office, and what each of
 * them can reach.
 *
 * MASTER ADMINS ONLY, and the refusal is its own screen rather than an empty
 * list. A plain admin who lands here should be told they cannot manage the
 * team, not shown a page that looks broken.
 *
 * The permission model is deliberately section-shaped — see
 * admin-permissions.ts. Saying so on the screen matters more than it looks:
 * somebody switching on "Orders" needs to know they have granted the whole of
 * it, refunds and internal notes included, rather than a reading permission.
 */
export default async function AdminTeamPage() {
  const me = await currentAdmin();

  if (!me?.isMaster) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-card border border-border-base bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-bold tracking-tight text-text">
          Only a master admin can manage the team
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Adding admins, changing what they can reach and resetting their
          passwords are all held by the master admin. Ask them if you need an
          account changed.
        </p>
        <Link
          href="/admin"
          className="inline-flex min-h-11 items-center gap-2 rounded-card border-2 border-navy bg-navy px-4 py-2 font-bold text-white mt-4 inline-block px-3 py-1.5 text-xs text-on-navy transition-colors hover:bg-navy-hover"
        >
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const accounts = await listAdmins();

  return (
    <div className="px-4 py-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-text">Admin team</h1>
      <p className="mt-1 max-w-3xl text-sm text-text-muted">
        Everybody who can sign in to the back office, and what each of them can
        reach. You are a master admin, so you can add accounts, set what they
        see, reset a password and disable somebody.
      </p>
      <p className="mt-2 max-w-3xl rounded-card border-l-4 border-navy-border bg-navy-soft px-3 py-2 text-xs text-text">
        <span className="font-bold">Section access and changes are separate.</span> An
        admin can view a section without permission to make changes. Hidden
        sections cannot be changed, even when their change permission is enabled.
      </p>

      <AdminTeam
        groups={ADMIN_PERMISSIONS.map((group) => ({
          heading: group.heading,
          permissions: group.permissions.map((permission) => ({
            key: permission.key,
            label: permission.label,
            detail: permission.detail,
          })),
        }))}
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          username: account.username,
          email: account.email,
          isMasterAdmin: account.isMasterAdmin,
          isDisabled: account.isDisabled,
          denied: account.denied,
          isYou: account.isYou,
          // Formatted here, like every other date on an admin page.
          createdOn: day(account.createdAt),
        }))}
      />
    </div>
  );
}
