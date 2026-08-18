import type { ReactNode } from "react";

/**
 * Shared shell for the low-traffic content pages. Copy on these is placeholder
 * until the business supplies the real wording — each page says so rather than
 * shipping invented policy text as if it were approved.
 */
export function ContentPage({
  title,
  intro,
  children,
  placeholder = true,
  banner,
}: {
  title: string;
  intro: string;
  children?: ReactNode;
  placeholder?: boolean;
  /** Replaces the placeholder notice, for a page that has real copy on it. */
  banner?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-text">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-text-muted">{intro}</p>

      {banner ? (
        <div className="mt-6 rounded-card border border-accent-border bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent">
          {banner}
        </div>
      ) : (
        placeholder && (
          <p className="mt-6 rounded-card border border-accent-border bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent">
            Placeholder copy. This page needs approved wording from the business
            before launch.
          </p>
        )
      )}

      {children && (
        <div className="mt-8 space-y-6 leading-relaxed text-text-muted">
          {children}
        </div>
      )}
    </div>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-text">{heading}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}
