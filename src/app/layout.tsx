import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getAllProducts, getDepartments, getSuppliers } from "@/lib/catalog";
import { CatalogProvider } from "@/lib/catalog-client";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

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
  const [departments, products, suppliers] = await Promise.all([
    getDepartments(),
    getAllProducts(),
    getSuppliers(),
  ]);

  return (
    <html lang="en" className={bodyFont.variable}>
      <body className="flex min-h-screen flex-col">
        <CatalogProvider initialProducts={products} initialSuppliers={suppliers}>
        <StoreProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-brand focus:px-4 focus:py-2 focus:text-on-brand"
          >
            Skip to content
          </a>
          <Header departments={departments} />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </StoreProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
