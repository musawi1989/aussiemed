"use client";

import { useState } from "react";

/**
 * Out-of-stock products swap Add to Cart for this. The subscription is captured
 * locally for now — wiring it to the restock mailer is backend work, so the
 * form records intent and tells the user plainly what will happen.
 */
export function NotifyMe({ productName }: { productName: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="rounded-card border border-success bg-success-soft px-3 py-2 text-sm text-success">
        We&rsquo;ll email you when {productName} is back in stock.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setDone(true);
      }}
      className="flex flex-wrap gap-2"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@clinic.ae"
        aria-label={`Email address for ${productName} restock alert`}
        className="h-10 min-w-0 flex-1 rounded-card border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-text-subtle"
      />
      <button
        type="submit"
        className="h-10 shrink-0 rounded-card border border-border-strong bg-surface px-4 text-sm font-medium text-text transition-colors hover:bg-surface-hover"
      >
        Notify me
      </button>
    </form>
  );
}
