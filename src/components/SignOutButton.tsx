"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
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
      className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-bold text-text transition-colors hover:bg-surface-hover disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
