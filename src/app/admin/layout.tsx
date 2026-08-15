import type { Metadata } from "next";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { OpsShell, initialsOf } from "@/components/ops/OpsShell";
import type { OpsGroup } from "@/components/ops/OpsSidebar";
import { getSessionUser } from "@/lib/auth";

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
const GROUPS: OpsGroup[] = [
  {
    heading: null,
    icon: "dashboard",
    links: [{ href: "/admin", label: "Dashboard", exact: true }],
  },
  {
    heading: "Catalogue",
    icon: "catalogue",
    links: [
      { href: "/admin/products", label: "Products" },
      { href: "/admin/categories", label: "Categories" },
    ],
  },
  {
    heading: "Sales",
    icon: "sales",
    links: [{ href: "/admin/orders", label: "Orders" }],
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

  return (
    <OpsShell
      brand={{ label: "Admin", href: "/admin" }}
      groups={GROUPS}
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
