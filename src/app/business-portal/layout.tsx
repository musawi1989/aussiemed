import type { Metadata } from "next";
import Link from "next/link";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { TestCredentials } from "@/components/TestCredentials";
import { OpsShell, initialsOf } from "@/components/ops/OpsShell";
import type { OpsGroup } from "@/components/ops/OpsSidebar";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Business Portal",
  description:
    "Supplier sign-in for AussieMed. Manage your products, see the orders placed against them and track your invoices.",
  robots: { index: false, follow: false },
};

/**
 * The supplier's door and shell.
 *
 * A supplier is doing operational work, not shopping, so they get the same
 * rail as an admin rather than the storefront's chrome — the header they used
 * to sit under invited them to add their own stock to a cart.
 *
 * The rail lists only what exists. The rest of the portal is BE-21, and a
 * navigation entry leading to a page we have not built is worse than no entry.
 */
const GROUPS: OpsGroup[] = [
  {
    heading: null,
    icon: "dashboard",
    links: [{ href: "/business-portal", label: "Purchase orders", exact: true }],
  },
  {
    heading: null,
    icon: "catalogue",
    links: [{ href: "/business-portal/supplies", label: "What you supply" }],
  },
];

export default async function BusinessPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user || user.role !== "Supplier") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-12">
        <div className="w-full max-w-md">
          <p className="text-sm font-bold uppercase tracking-wide text-navy">
            Business portal
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text">
            AussieMed
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            For suppliers. Manage your products, see the orders placed against
            them and track your invoices.
          </p>

          <div className="mt-6">
            <RoleSignInForm
              expectRole="Supplier"
              next="/business-portal"
              accent="navy"
            />
          </div>

          <p className="mt-4 text-center text-sm text-text-muted">
            Buying from AussieMed?{" "}
            <Link href="/sign-in" className="font-bold text-navy hover:underline">
              Account sign-in
            </Link>
          </p>

          <TestCredentials role="Supplier" />
        </div>
      </div>
    );
  }

  const supplier = user.supplierId
    ? await db.supplier.findUnique({
        where: { id: user.supplierId },
        select: { companyName: true },
      })
    : null;

  return (
    <OpsShell
      brand={{ label: "Supplier", href: "/business-portal" }}
      groups={GROUPS}
      user={{
        name: user.name,
        email: user.email,
        initials: initialsOf(supplier?.companyName ?? user.name),
        context: supplier?.companyName ?? "No supplier attached",
      }}
    >
      {children}
    </OpsShell>
  );
}
