import type { Metadata } from "next";
import { toneStyleBlock } from "@/lib/tone-colours";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  /**
   * The admin's chosen status colours, as variables on the document.
   *
   * Here rather than in each area's layout because they apply everywhere — the
   * storefront's progress bar, the admin's pills, a printed invoice — and one
   * declaration is what makes changing a colour once change all of them.
   *
   * Null until somebody actually chooses, so an untouched site emits no style
   * block at all and keeps its own tokens, including their dark variants. The
   * hex is re-validated where this is built; a stored value is not a safe one
   * to interpolate just because we stored it.
   */
  const tones = await toneStyleBlock();

  return (
    <html lang="en" className={bodyFont.variable}>
      {tones && (
        <head>
          <style>{tones}</style>
        </head>
      )}
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
