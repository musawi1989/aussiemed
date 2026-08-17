import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RoleSignInForm } from "@/components/RoleSignInForm";
import { googleEnabled } from "@/lib/oauth";
import { TestCredentials } from "@/components/TestCredentials";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your AussieMed trade account to reorder, track orders and view your invoices.",
};

/** The buyer's door. Suppliers and admins have their own. */
export default async function SignInPage() {
  const user = await getSessionUser();
  if (user) {
    redirect(
      user.role === "Admin"
        ? "/admin"
        : user.role === "Supplier"
          ? "/business-portal"
          : "/account"
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-text">
        Sign in to your account
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        For clinics and buyers. Your account shows what you&rsquo;ve ordered
        before so you can repeat it in a couple of taps.
      </p>

      <div className="mt-6">
        <RoleSignInForm
          expectRole="Customer"
          next="/account"
          googleEnabled={googleEnabled()}
        />
      </div>

      <p className="mt-4 text-center text-sm text-text-muted">
        Supplying to AussieMed?{" "}
        <Link href="/business-portal" className="font-bold text-navy hover:underline">
          Business portal
        </Link>
      </p>

      <TestCredentials role="Customer" />
    </div>
  );
}
