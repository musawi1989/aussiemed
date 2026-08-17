"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * One sign-in form, three doors.
 *
 * The role is fixed by which page renders this, so a supplier signing in at
 * the buyer door is told where to go rather than being let into the wrong
 * area. Same credentials, same mechanism — only the entrance differs.
 */
export function RoleSignInForm({
  expectRole,
  next,
  accent = "red",
  googleEnabled = false,
}: {
  expectRole: "Customer" | "Supplier" | "Admin";
  next: string;
  accent?: "red" | "navy";
  /**
   * Only ever true at the buyer door. Suppliers and admins are accounts we
   * create, so a Google button there would offer a route that leads nowhere.
   */
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // An unconfirmed address is something the person can fix, so it gets a way
  // forward rather than just a red box.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password, expectRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not sign you in");
        setNeedsVerification(data?.error?.needsVerification === true);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const button =
    accent === "navy"
      ? "bg-navy text-on-navy hover:bg-navy-hover"
      : "bg-red text-on-red hover:bg-red-hover";

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-border-base bg-surface p-6 shadow-card"
    >
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-text">
          Username or email
        </span>
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
          className="h-11 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
        />
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-bold text-text">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-card border border-border-strong bg-surface px-3 text-sm text-text"
        />
      </label>

      {error && (
        <div className="mt-4 rounded-card border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          {needsVerification && (
            <Link href="/sign-up" className="mt-1 inline-block font-bold underline">
              Enter your confirmation code
            </Link>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`mt-5 h-11 w-full rounded-card font-bold transition-colors disabled:opacity-60 ${button}`}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {googleEnabled && (
        <>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border-base" />
            <span className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
              or
            </span>
            <span className="h-px flex-1 bg-border-base" />
          </div>
          <a
            href="/api/v1/auth/google?intent=signin"
            className="flex h-11 items-center justify-center rounded-card border border-border-strong bg-surface text-sm font-bold text-text transition-colors hover:bg-surface-hover"
          >
            Continue with Google
          </a>
        </>
      )}

      {/* Only at the buyer door. Trade accounts are opened by application, so
          for a new customer this is a real route rather than a courtesy link —
          and for a supplier or an admin there is nothing to apply for. */}
      {expectRole === "Customer" && (
        <p className="mt-5 border-t border-border-base pt-4 text-center text-sm text-text-muted">
          No account yet?{" "}
          <Link href="/sign-up" className="font-bold text-navy hover:underline">
            Open a trade account
          </Link>
        </p>
      )}
    </form>
  );
}
