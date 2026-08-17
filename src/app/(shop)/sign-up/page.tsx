import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/oauth";
import { SignUpFlow } from "./SignUpFlow";

export const metadata: Metadata = {
  title: "Open a trade account",
  description:
    "Apply for an AussieMed trade account. We confirm your email, then an account manager reviews the application.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string }>;
}) {
  const { verify } = await searchParams;
  // Somebody already signed in has no business here, and landing on a sign-up
  // form while signed in reads as having been logged out.
  const user = await getSessionUser();
  if (user) redirect(user.role === "Admin" ? "/admin" : "/account");

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <SignUpFlow
        googleEnabled={googleEnabled()}
        verifyEmail={verify?.includes("@") ? verify.trim().toLowerCase() : undefined}
      />
    </div>
  );
}
