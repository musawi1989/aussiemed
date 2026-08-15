import type { Metadata } from "next";
import Link from "next/link";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { AdminNav } from "@/components/AdminNav";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin",
  description: "AussieMed administration.",
  robots: { index: false, follow: false },
};

/**
 * The admin door.
 *
 * The guard lives in the layout so it covers every screen beneath /admin,
 * including ones added later — a page that forgets to check is the usual way
 * an admin area leaks. The service layer checks again on every write, because
 * a server action is reachable without ever rendering a page.
 *
 * Signing in happens here too, so an admin who follows a link to a deep screen
 * lands back on it after signing in rather than on the dashboard.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user || user.role !== "Admin") {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight text-text">Admin</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Administration for AussieMed staff.
        </p>

        <div className="mt-6">
          <RoleSignInForm expectRole="Admin" next="/admin" accent="navy" />
        </div>

        <TestCredentials role="Admin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border-base pb-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-red">
            Admin
          </p>
          <Link
            href="/admin"
            className="mt-1 block text-2xl font-bold tracking-tight text-text hover:text-navy"
          >
            AussieMed
          </Link>
          <p className="mt-1 text-sm text-text-muted">
            {user.name} &middot; {user.email}
          </p>
        </div>
      </div>

      <AdminNav />

      {children}
    </div>
  );
}
