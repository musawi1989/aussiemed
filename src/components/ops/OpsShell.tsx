import { OpsSidebar, type OpsGroup } from "./OpsSidebar";

/**
 * The frame every back-office screen sits in.
 *
 * Full width rather than a centred column: these screens are tables of orders
 * and rows of line items, and the reference UI gives them the whole window.
 * The content area is sunken so the cards and tables inside it read as raised
 * surfaces, which is what makes a dense table scannable.
 */
export function OpsShell({
  brand,
  groups,
  user,
  searchPlaceholder,
  children,
}: {
  brand: { label: string; href: string };
  groups: OpsGroup[];
  user: { name: string; email: string; initials: string; context: string };
  /** Passed through to the sidebar. Omitted, there is no search box. */
  searchPlaceholder?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <OpsSidebar
        brand={brand}
        groups={groups}
        user={user}
        searchPlaceholder={searchPlaceholder}
      />
      <div className="min-w-0 flex-1 bg-surface-sunken print:bg-surface">
        <main id="main" className="px-4 py-5 lg:px-6 print:px-0 print:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Two letters from a name, for the identity block. "AussieMed Admin" -> AA. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
