import Link from "next/link";

export type BranchOption = { id: string; label: string };

/**
 * "Which site are we talking about?"
 *
 * A practice with three clinics does not have one set of orders, one bill and
 * one shopping list — it has three of each, and the manager asking a question
 * is nearly always asking it about one of them. Every account screen therefore
 * carries the same filter in the same place, so the answer to "how do I see
 * just Jumeirah" is learned once.
 *
 * Hidden entirely for an account with one branch: a filter with a single
 * option is a control that cannot do anything, and it makes a simple account
 * look complicated.
 *
 * A link rather than a dropdown, and the choice lives in the URL: the back
 * button works, a branch view can be sent to a colleague, and it survives with
 * JavaScript off.
 */
export function BranchFilter({
  basePath,
  branches,
  active,
  /** Carried through so choosing a branch does not silently reset a period. */
  keep = {},
}: {
  basePath: string;
  branches: BranchOption[];
  active?: string;
  keep?: Record<string, string | undefined>;
}) {
  if (branches.length < 2) return null;

  const href = (branchId?: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep)) {
      if (value) params.set(key, value);
    }
    if (branchId) params.set("branch", branchId);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Filter by branch">
      <Chip href={href()} active={!active} label="All branches" />
      {branches.map((branch) => (
        <Chip
          key={branch.id}
          href={href(branch.id)}
          active={active === branch.id}
          label={branch.label}
        />
      ))}
    </nav>
  );
}

function Chip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-card px-3 py-1.5 text-sm font-bold transition-colors ${
        active
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
    </Link>
  );
}
