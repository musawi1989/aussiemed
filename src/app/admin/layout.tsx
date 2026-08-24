import type { Metadata } from "next";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { OpsShell, initialsOf } from "@/components/ops/OpsShell";
import type { OpsGroup } from "@/components/ops/OpsSidebar";
import { getSessionUser } from "@/lib/auth";
import { attentionCount } from "@/lib/attention";
import { unreadCount } from "@/lib/notifications";

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
const groupsFor = (waiting: number, unread: number): OpsGroup[] => [
  {
    heading: null,
    icon: "dashboard",
    links: [
      { href: "/admin", label: "Dashboard", exact: true },
      // Above Needs attention: the inbox is what happened, and the panel is
      // what is still to do. People look at the first one first.
      { href: "/admin/inbox", label: "Inbox", count: unread },
      // Second, not buried under System: it is the answer to "what needs me
      // today", and a queue nobody can find is a queue nobody works.
      { href: "/admin/approvals", label: "Needs attention", count: waiting },
    ],
  },
  {
    heading: "Sales",
    icon: "sales",
    links: [
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/enquiries", label: "Enquiries" },
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
    links: [{ href: "/admin/purchasing", label: "Purchase orders" }],
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
      { href: "/admin/reports", label: "Profit", exact: true },
      { href: "/admin/reports/products", label: "Products" },
      { href: "/admin/reports/customers", label: "Customers" },
      { href: "/admin/reports/suppliers", label: "Suppliers" },
    ],
  },
  {
    heading: "System",
    icon: "system",
    links: [
      { href: "/admin/settings", label: "Settings" },
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

  const [waiting, unread] = await Promise.all([attentionCount(), unreadCount()]);

  return (
    <OpsShell
      brand={{ label: "Admin", href: "/admin" }}
      groups={groupsFor(waiting, unread)}
      user={{
        name: user.name,
        email: user.email,
        initials: initialsOf(user.name),
        context: "Administration",
      }}
    >
      {children}
    </OpsShell>
  );
}
