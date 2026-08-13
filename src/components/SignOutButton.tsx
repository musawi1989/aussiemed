"use client";

import { useStore } from "@/lib/store";

export function SignOutButton() {
  const { signOut } = useStore();
  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-card border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
    >
      End demo session
    </button>
  );
}
