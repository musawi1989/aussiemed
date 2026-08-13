import Link from "next/link";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "All products", href: "/products" },
      { label: "Bulk buy enquiry", href: "/bulk-buy" },
      { label: "Quote request", href: "/quote" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Cart", href: "/cart" },
    ],
  },
  {
    title: "Your account",
    links: [
      { label: "Reorder", href: "/account" },
      { label: "Your orders", href: "/account/orders" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Order support", href: "/order-support" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms & conditions", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border-base bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-card bg-brand text-on-brand">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight text-text">AussieMed</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-text-muted">
            Medical, dental and laboratory supplies for trade buyers. Volume
            pricing on every line, with one reference number per order.
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-semibold text-text">{column.title}</h2>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-muted transition-colors hover:text-brand"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border-base">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-text-subtle">
          <p>&copy; {new Date().getFullYear()} AussieMed. All prices in AED.</p>
          {/* TODO: confirm the final contact address before launch — the old
              site used a misspelled domain. */}
          <p>info@aussiemed.com</p>
        </div>
      </div>
    </footer>
  );
}
