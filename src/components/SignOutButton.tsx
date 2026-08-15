"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_CLASS =
  "rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60";

/**
 * `className` lets the header render this at its own size without a second
 * copy of the sign-out call. The fetch is the part worth having in one place —
 * it deletes the session row rather than only clearing the cookie.
 */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Deletes the session row, not just the cookie.
        await fetch("/api/v1/auth", { method: "DELETE" });
        router.push("/");
        router.refresh();
      }}
      className={className ?? DEFAULT_CLASS}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
