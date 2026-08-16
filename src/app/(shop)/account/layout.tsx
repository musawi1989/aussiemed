import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  accountBranches,
  accountIdentity,
  accountPendingCount,
  accountSession,
  accountStaff,
} from "@/lib/account";
import { AccountTabs, type AccountTab } from "@/components/AccountTabs";

/**
 * The frame every account screen sits in.
 *
 * The sign-in guard lives here so it covers each tab including ones added
 * later — a page that forgets to check is the usual way an account area
 * leaks. The service layer scopes every query by the session regardless.
 *
 * Branches and Who orders only appear for a trade account. A personal login
 * has neither, and a tab leading to a page that redirects straight back is
 * worse than no tab.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?next=/account");
  if (user.role === "Admin") redirect("/admin");
  if (user.role === "Supplier") redirect("/business-portal");

  const session = await accountSession();

  const [identity, orderCount, savedCount, branches, staff, waiting] = session
    ? await Promise.all([
        accountIdentity(),
        db.order.count({ where: { organisationId: session.organisationId } }),
        db.wishlistItem.count({ where: { userId: user.id } }),
        accountBranches(),
        accountStaff(),
        accountPendingCount(),
      ])
    : [
        null,
        0,
        await db.wishlistItem.count({ where: { userId: user.id } }),
        [],
        [],
        0,
      ];

  const tabs: AccountTab[] = [
    { href: "/account", label: "Overview", exact: true },
    ...(session
      ? [
          {
            href: "/account/orders",
            label: "Orders",
            count: orderCount,
            also: ["/account/reorder"],
          },
        ]
      : []),
    { href: "/account/products", label: "My products", count: savedCount },
    ...(session
      ? [
          { href: "/account/branches", label: "Branches", count: branches.length },
          { href: "/account/staff", label: "Who orders", count: staff.length },
          // The count is deliberately what is waiting on us, not the length of
          // the log. A badge showing 40 past changes tells nobody anything;
          // one showing 2 waiting is the reason to click.
          {
            href: "/account/changes",
            label: "Account changes",
            count: waiting,
            attention: waiting > 0,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="border-b border-border-base pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-text">
          {identity?.organisationName || user.name}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {user.name} &middot; {user.email}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <AccountTabs tabs={tabs} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
