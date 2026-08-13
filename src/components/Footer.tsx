import Image from "next/image";
import Link from "next/link";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { label: "Product range", href: "/products" },
      { label: "Get bulk prices", href: "/bulk-buy" },
      { label: "Quote request", href: "/quote" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Cart", href: "/cart" },
    ],
  },
  {
    title: "Your account",
    links: [
      { label: "Business portal", href: "/account" },
      { label: "Reorder", href: "/account" },
      { label: "Your orders", href: "/account/orders" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Contact us", href: "/contact" },
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
    <footer className="mt-20 bg-navy-deep text-white/70">
      <div className="mx-auto grid max-w-[1600px] gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:pr-6">
          {/* The logo lockup is dark-on-light, so it needs a light plate here. */}
          <span className="inline-flex rounded-card bg-white px-3 py-2">
            <Image
              src="/brand/logo.png"
              alt="AussieMed"
              width={140}
              height={52}
              className="h-10 w-auto object-contain"
            />
          </span>
          <p className="mt-4 text-sm leading-relaxed">
            One-stop online medical supply partner. From clinics to hospitals,
            we provide the essentials that keep healthcare moving.
          </p>
          <p className="mt-4 text-sm">
            {/* TODO: confirm the final address — the old site used a
                misspelled domain. */}
            <a
              href="mailto:info@aussiemed.com"
              className="font-semibold text-white transition-colors hover:text-red"
            >
              info@aussiemed.com
            </a>
          </p>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.label}`}>
                  <Link
                    href={link.href}
                    className="text-sm transition-colors hover:text-red"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs">
          <p>&copy; {new Date().getFullYear()} AussieMed. All rights reserved.</p>
          <p>All prices in AED, excluding 5% VAT.</p>
        </div>
      </div>
    </footer>
  );
}
