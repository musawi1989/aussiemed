"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { DEMO_CUSTOMER } from "@/lib/demo-account";

/**
 * Stands in for an authenticated session. There is no real auth yet — this
 * flips a localStorage flag so the account surfaces can be built and reviewed.
 * It must be replaced wholesale by the OTP flow, not extended.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const { ready, signedIn, signIn } = useStore();

  if (!ready) {
    return (
      <div className="rounded-panel border border-border-base bg-surface p-10 text-center text-text-muted">
        Loading&hellip;
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md rounded-panel border border-border-base bg-surface p-8 shadow-card">
        <h2 className="text-lg font-semibold text-text">Sign in to your account</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Your account shows what you&rsquo;ve ordered before so you can repeat
          it in a couple of taps.
        </p>

        <p className="mt-5 rounded-card border border-accent-border bg-accent-soft px-3 py-2 text-sm leading-relaxed text-accent">
          Authentication isn&rsquo;t built yet. This button opens a demo session
          for <strong>{DEMO_CUSTOMER.company}</strong> with an invented order
          history, so the account pages can be reviewed. Real sign-in is email
          OTP, and comes with the backend.
        </p>

        <button
          type="button"
          onClick={signIn}
          className="mt-5 h-11 w-full rounded-card bg-brand font-medium text-on-brand transition-colors hover:bg-brand-hover"
        >
          Open demo session
        </button>

        <Link
          href="/products"
          className="mt-3 block text-center text-sm text-text-muted hover:text-brand"
        >
          Continue browsing instead
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
