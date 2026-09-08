import { AdminBackButton } from "@/components/admin/AdminBackButton";
import type { Metadata } from "next";
import { FormWorkspace } from "@/components/admin/FormWorkspace";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { OpsShell, initialsOf } from "@/components/ops/OpsShell";
import type { OpsGroup } from "@/components/ops/OpsSidebar";
import { getSessionUser } from "@/lib/auth";
import { attentionCount } from "@/lib/attention";
import { openBulkBuyCount } from "@/lib/bulk-buy-admin";
import { currentAdmin } from "@/lib/admin-team";
import { canReach } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Admin",
  description: "AussieMed administration.",
  robots: { index: false, follow: false },
};

/**
 * The admin door, and the shell behind it.
 *
 * The guard lives in the layout so it covers every screen beneath /admin,
 * including ones added later — a page that forgets to check is the usual way
 * an admin area leaks. The service layer checks again on every write, because
 * a server action is reachable without ever rendering a page.
 *
 * Signing in happens here too, so an admin who follows a link to a deep screen
 * lands back on it after signing in rather than on the dashboard.
 */

/**
 * Grouped the way the work is, not the way the database is: what has been
 * sold, what is on sale, who is involved, and the machinery underneath.
 *
 * SALES SITS ABOVE CATALOGUE at the client's request (24 Aug 2026). Orders are
 * what somebody opens the back office to deal with; the catalogue is what they
 * go to when something needs changing, which is less often.
 */
const groupsFor = (waiting: number, bulkBuy: number): OpsGroup[] => [
  {
    heading: null,
    icon: "dashboard",
    links: [
      { href: "/admin", label: "Dashboard", exact: true },
      // Not buried under System: it is the answer to "what needs me today",
      // and a queue nobody can find is a queue nobody works. The Inbox sat
      // above it until 28 Aug 2026 and was removed — it recorded that an order
      // had arrived, which the orders list says better, and the three events
      // that would have justified it were never wired up.
      { href: "/admin/approvals", label: "Needs attention", count: waiting },
    ],
  },
  {
    heading: "Sales",
    icon: "sales",
    links: [
      { href: "/admin/orders", label: "Orders", exact: true },
      { href: "/admin/received-products", label: "Received products" },
      /*
       * Its own place in the sidebar, at the client's request.
       *
       * It was two headings buried at the bottom of Needs attention — "Quote
       * requests" and "Bulk-buy enquiries", the same conversation arriving
       * through two doors. One queue now, and one somebody can find.
       */
      { href: "/admin/bulk-buy", label: "Bulk buy requests", count: bulkBuy },
      // The kanban view of the same orders. It lived behind a tab on the list
      // and nobody who had not clicked that tab knew it existed.
      { href: "/admin/orders/board", label: "Order board" },
      { href: "/admin/searches", label: "Searches" },
    ],
  },
  {
    heading: "Catalogue",
    icon: "catalogue",
    links: [
      { href: "/admin/products", label: "Products", exact: true },
      { href: "/admin/products/upload", label: "Load catalogue" },
      { href: "/admin/categories", label: "Categories" },
    ],
  },
  {
    heading: "Buying",
    icon: "catalogue",
    links: [
      { href: "/admin/purchasing", label: "Purchase orders", exact: true },
      // Existed and was reachable only from inside Purchasing, so nobody who
      // had not already found it knew it was there.
      { href: "/admin/purchasing/backorders", label: "Backorders" },
    ],
  },
  {
    heading: "People",
    icon: "people",
    links: [
      { href: "/admin/customers", label: "Customers" },
      // Above suppliers because it is a queue rather than a list: somebody is
      // waiting on it, and a trade account nobody notices for three days is a
      // customer who has gone somewhere else.
      { href: "/admin/applications", label: "Applications" },
      { href: "/admin/suppliers", label: "Suppliers" },
    ],
  },
  {
    /*
     * Its own section, at the client's request on 24 Aug 2026.
     *
     * The three reports used to be a tab apiece under Products, Customers
     * and Suppliers — three answers to one question in three places, and
     * nobody found the second one. Below People because "how did we do" is
     * a weekly question and the lists above are daily ones.
     */
    heading: "Reports",
    icon: "sales",
    links: [
      { href: "/admin/reports", label: "Profit & margin", exact: true },
      { href: "/admin/reports/products", label: "By product" },
      { href: "/admin/reports/customers", label: "By customer" },
      { href: "/admin/reports/suppliers", label: "By supplier" },
    ],
  },
  {
    heading: "System",
    icon: "system",
    links: [
      { href: "/admin/settings", label: "Settings" },
      // Next to Settings because that is where its one predecessor lived — the
      // supplier-additions checkbox — and where somebody will look for it.
      { href: "/admin/team", label: "Admin team" },
      { href: "/admin/roles", label: "Roles & permissions" },
      { href: "/admin/emails", label: "Email" },
      { href: "/admin/audit", label: "Audit trail" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user || user.role !== "Admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-12">
        <div className="w-full max-w-md">
          <p className="text-sm font-bold uppercase tracking-wide text-red">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
            AussieMed
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Administration for AussieMed staff.
          </p>

          <div className="mt-6">
            <RoleSignInForm expectRole="Admin" next="/admin" accent="navy" />
          </div>

          <TestCredentials role="Admin" />
        </div>
      </div>
    );
  }

  // Both counts in one round trip. The bulk-buy badge is what is OPEN, not
  // the length of the list: a badge reading 40 past requests tells nobody
  // anything, one reading 2 waiting is the reason to click.
  const [waiting, bulkBuy] = await Promise.all([
    attentionCount(),
    openBulkBuyCount(),
  ]);

  /**
   * The nav, narrowed to what this admin actually holds.
   *
   * HIDING IS A COURTESY, NOT THE CONTROL. Every screen guards itself as well —
   * a link somebody cannot see is still a URL somebody can type, and a nav that
   * was the only thing standing between a limited admin and the margin report
   * would be no control at all. This exists so people are not shown doors that
   * will not open.
   *
   * A group left with no links disappears rather than becoming a heading over
   * nothing.
   */
  const me = await currentAdmin();
  const allowed = (href: string) =>
    !me || canReach(href, { isMaster: me.isMaster, denied: me.denied });

  const groups = groupsFor(waiting, bulkBuy)
    .map((group) => ({ ...group, links: group.links.filter((l) => allowed(l.href)) }))
    .filter((group) => group.links.length > 0);

  return (
    <FormWorkspace><OpsShell
      brand={{ label: "Admin", href: "/admin" }}
      groups={groups}
      searchPlaceholder="Order, product, customer…"
      user={{
        name: user.name,
        email: user.email,
        initials: initialsOf(user.name),
        context: "Administration",
      }}
    >
      <AdminBackButton />
      {children}
    </OpsShell></FormWorkspace>
  );
}
