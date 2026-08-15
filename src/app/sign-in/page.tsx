import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your AussieMed trade account to reorder, track orders and view your invoices.",
};

export default async function SignInPage() {
  // Already signed in — no reason to show the form.
  const user = await getSessionUser();
  if (user) redirect(user.role === "Admin" ? "/admin" : "/account");

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight text-text">Sign in</h1>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        Your account shows what you&rsquo;ve ordered before so you can repeat it
        in a couple of taps.
      </p>

      <div className="mt-6">
        <Suspense fallback={<div className="h-72" />}>
          <SignInForm />
        </Suspense>
      </div>

      {/*
        Test credentials, shown deliberately while this runs locally. It must
        be removed before anything is deployed — SEC-01 in the register.
      */}
      <div className="mt-6 rounded-card border border-accent-border bg-accent-soft p-4 text-sm leading-relaxed text-accent">
        <p className="font-bold">Test accounts — local development only</p>
        <ul className="mt-2 space-y-0.5 tnum">
          <li>admin</li>
          <li>musawi1989@gmail.com</li>
          <li>supplier1</li>
          <li>supplier2</li>
        </ul>
        <p className="mt-2">Password for all four: 123456</p>
      </div>
    </div>
  );
}
