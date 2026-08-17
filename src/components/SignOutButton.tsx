"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Red, and owned here rather than passed in.
 *
 * Signing out is the one destructive-feeling control in the header, and it was
 * a grey outline identical to every secondary button on the site. It is now
 * red everywhere, and the colour lives in the component so it cannot end up
 * red in the header and grey in the operations sidebar — the two call sites
 * previously passed their own full class string and were free to disagree.
 *
 * Callers still choose the size, because a header button and a sidebar button
 * are genuinely different sizes; they no longer choose the colour.
 */
const TONE =
  "rounded-card bg-red font-bold text-on-red transition-colors " +
  "hover:bg-red-hover disabled:opacity-60";

/** A fifth larger than it was, per the client's request. */
const DEFAULT_SIZE = "px-[1.15rem] py-[0.72rem] text-[1.05rem]";

export function SignOutButton({ sizeClassName }: { sizeClassName?: string }) {
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
      className={`${TONE} ${sizeClassName ?? DEFAULT_SIZE}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
