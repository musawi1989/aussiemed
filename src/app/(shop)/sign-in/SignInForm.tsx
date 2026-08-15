"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not sign you in");
        return;
      }
      // Refresh so server components pick the session up.
      router.push(data.user.role === "Admin" ? "/admin" : next);
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

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
        <p className="mt-4 rounded-card border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 h-11 w-full rounded-card bg-red font-bold text-on-red transition-colors hover:bg-red-hover disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
