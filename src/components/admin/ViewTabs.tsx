import Link from "next/link";

/** List and board are two readings of the same queue, so they share a URL root. */
export function ViewTabs({ active }: { active: "list" | "board" }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={on ? "page" : undefined}
      className={`rounded-card px-3 py-2 text-sm font-bold transition-colors ${
        on
          ? "bg-navy text-on-navy"
          : "border border-border-strong bg-surface text-text-muted hover:text-navy"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex items-center gap-1.5">
      {tab("/admin/orders", "List", active === "list")}
      {tab("/admin/orders/board", "Board", active === "board")}
    </div>
  );
}
