import type { Metadata } from "next";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { OpsShell, initialsOf } from "@/components/ops/OpsShell";
import type { OpsGroup } from "@/components/ops/OpsSidebar";
import { getSessionUser } from "@/lib/auth";
import { attentionCount } from "@/lib/attention";

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
 * Grouped the way the work is, not the way the database is: what is on sale,
 * what has been sold, who is involved, and the machinery underneath.
 */
const groupsFor = (waiting: number): OpsGroup[] => [
  {
    heading: null,
    icon: "dashboard",
    links: [
      { href: "/admin", label: "Dashboard", exact: true },
      // Second, not buried under System: it is the answer to "what needs me
      // today", and a queue nobody can find is a queue nobody works.
      { href: "/admin/approvals", label: "Needs attention", count: waiting },
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
    heading: "Sales",
    icon: "sales",
    links: [
      { href: "/admin/orders", label: "Orders" },
      { href: "/admin/enquiries", label: "Enquiries" },
      { href: "/admin/searches", label: "Searches" },
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
      { href: "/admin/suppliers", label: "Suppliers" },
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

  const waiting = await attentionCount();

  return (
    <OpsShell
      brand={{ label: "Admin", href: "/admin" }}
      groups={groupsFor(waiting)}
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
