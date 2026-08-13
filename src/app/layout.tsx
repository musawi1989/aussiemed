import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getDepartments } from "@/lib/catalog";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  robots: {
    // Staging only. Remove before production launch.
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const departments = getDepartments();

  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
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
      </body>
    </html>
  );
}
