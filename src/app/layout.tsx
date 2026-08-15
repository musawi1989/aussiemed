import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

/**
 * The document, and nothing else.
 *
 * The storefront's header and footer used to live here, which meant every page
 * in the application wore the shop's chrome — a warehouse processing an order
 * got a shopping cart and a "Browse All Category" bar, and a printed tax
 * invoice carried both onto the paper.
 *
 * Now this file owns only what is genuinely global: the document, the
 * typeface and the stylesheet. The storefront's furniture belongs to the
 * (shop) route group; /admin and /business-portal have an operations shell of
 * their own. Route groups are invisible in the URL, so nothing moved.
 */

/**
 * Body typeface. Gilroy Regular/Medium were never delivered with the theme, so
 * body copy needs a stand-in; Figtree is a close geometric sans. Headings use
 * real Gilroy (Bold/Black), self-hosted from public/fonts.
 *
 * When licensed Gilroy Regular/Medium arrive, add them as @font-face in
 * globals.css and point --font-body at Gilroy. Nothing else changes.
 */
const bodyFont = Figtree({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aussiemed.example"),
  title: {
    // Every page sets its own title; this template guarantees the old site's
    // "every page is 'Aussie Med || Home'" problem cannot recur.
    default: "AussieMed — Medical, Dental & Laboratory Supplies",
    template: "%s | AussieMed",
  },
  description:
    "Trade supplier of medical, dental and laboratory consumables and equipment across the UAE, with volume pricing on every line.",
  icons: { icon: "/brand/favicon.png" },
  robots: {
    // Staging only. Remove before production launch.
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={bodyFont.variable}>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
