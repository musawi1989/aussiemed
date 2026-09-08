import Link from "next/link";
import { currentAdmin } from "@/lib/admin-team";
import { canReach, permissionForPath, findAdminPermission } from "@/lib/admin-permissions";

/**
 * Refuses a section this admin does not hold.
 *
 * ONE OF THESE PER SECTION, mounted as that section's layout, so it covers
 * every page beneath it — including the ones somebody adds next month without
 * thinking about permissions. A guard written into each page is a guard that
 * gets forgotten, and the failure is silent: the screen simply works for
 * somebody who should not see it.
 *
 * IT REFUSES RATHER THAN THROWING. A 500 tells somebody the system is broken
 * when the truth is that they are not allowed in, and the difference decides
 * whether they raise a bug or ask for access. It also names who to ask, because
 * "contact your administrator" when the reader IS an administrator is a dead
 * end.
 *
 * The nav hides these links as well. That is a courtesy, not the control: a
 * link somebody cannot see is still a URL somebody can type.
 *
 * ⚠ THIS GATES SCREENS, NOT WRITES. A server action is reachable without ever
 * rendering a page, so anything destructive still checks for itself in the
 * service layer — see requireAdmin and requireMaster.
 */
export async function SectionGuard({
  path,
  children,
}: {
  /** The section root, exactly as it appears in ADMIN_PERMISSIONS. */
  path: string;
  children: React.ReactNode;
}) {
  const me = await currentAdmin();

  // No admin at all: the /admin layout above already renders the sign-in door,
  // so there is nothing useful to say here and nothing to protect.
  if (!me) return <>{children}</>;

  if (canReach(path, { isMaster: me.isMaster, denied: me.denied })) {
    return <>{children}</>;
  }

  const key = permissionForPath(path);
  const permission = key ? findAdminPermission(key) : null;

  return (
    <div className="mx-auto mt-10 max-w-xl rounded-card border border-border-base bg-surface p-6 text-center shadow-card">
      <h1 className="text-lg font-bold tracking-tight text-text">
        You do not have access to this section
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        {permission ? (
          <>
            <span className="font-semibold text-text">{permission.label}</span> is
            switched off for your account. {permission.detail}
          </>
        ) : (
          "This section is switched off for your account."
        )}
      </p>
      <p className="mt-3 text-sm text-text-muted">
        A master admin can turn it on from Admin team. Nothing is wrong — this
        is a setting, not a fault.
      </p>
      <Link
        href="/admin"
        className="mt-4 inline-block rounded-card bg-navy px-3 py-1.5 text-xs font-bold text-on-navy transition-colors hover:bg-navy-hover"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
