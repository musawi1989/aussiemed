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
 *
 * The RADIUS joined size on the caller's side of that line on 24 Aug 2026, when
 * the storefront header went to pills and the operations sidebar did not. It is
 * not the thing the shared constant was protecting: the failure it guards
 * against is this button being red in one place and grey in another, which is a
 * question about what the control MEANS. A header that matches its neighbours
 * and a sidebar that matches its own is two surfaces each being consistent,
 * which is the opposite failure.
 */
const TONE =
  "bg-red font-bold text-on-red transition-colors " +
  "hover:bg-red-hover disabled:opacity-60";

/** A fifth larger than it was, per the client's request. */
const DEFAULT_SIZE = "px-[1.15rem] py-[0.72rem] text-[1.05rem]";

/** The back office's corner. The storefront header asks for a pill. */
const DEFAULT_SHAPE = "rounded-card";

export function SignOutButton({
  sizeClassName,
  shapeClassName,
}: {
  sizeClassName?: string;
  shapeClassName?: string;
}) {
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
      className={`${TONE} ${shapeClassName ?? DEFAULT_SHAPE} ${sizeClassName ?? DEFAULT_SIZE}`}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
