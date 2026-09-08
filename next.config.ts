import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The optimizer does not forward authentication to protected source images.
  // Let the browser fetch them with its preview credentials while the gate is on.
  images: { unoptimized: Boolean(process.env.PREVIEW_PASSWORD?.trim()) },
  // Keep the local preview's build cache separate from the shared preview.
  distDir: process.env.AUSSIEMED_LOCAL_PREVIEW === "1" ? `.next/local-preview${process.env.AUSSIEMED_LOCAL_PORT ? `-${process.env.AUSSIEMED_LOCAL_PORT}` : ""}` : ".next",
  /**
   * Origins allowed to reach the dev server, beyond localhost.
   *
   * The site is shared for testing through a Cloudflare quick tunnel, which
   * serves it from a random *.trycloudflare.com hostname. Next blocks
   * cross-origin requests to dev-only endpoints by default, so without this the
   * pages load and then the dev toolkit, hot reload and anything that posts
   * back quietly fail from that hostname — which looks like the app being
   * broken rather than the dev server defending itself.
   *
   * The hostname changes every time the tunnel restarts, so this is a wildcard
   * over the domain rather than one address. DEV ONLY: the option has no effect
   * on a production build, so it cannot widen anything that ships.
   */
  allowedDevOrigins: ["*.trycloudflare.com", "*.serveousercontent.com"],
  // Chromium cannot be bundled, and the tracer should not try. The order
  // confirmation PDF renders the HTML document with Playwright — see
  // src/app/(shop)/orders/[reference]/document/pdf/route.ts and IN-11.
  serverExternalPackages: ["playwright"],
  // The extraction mirror is reference material only — never part of the build.
  outputFileTracingExcludes: {
    "*": ["./extraction/**/*"],
  },
  /**
   * The three reports moved into one section on 24 Aug 2026.
   *
   * Redirected rather than left to 404: they were linked from each list's tab
   * strip for months, and a bookmark that dies silently is how somebody
   * concludes a report was deleted. Permanent, because the move is.
   */
  async redirects() {
    return [
      {
        source: "/admin/customers/reports",
        destination: "/admin/reports/customers",
        permanent: true,
      },
      {
        source: "/admin/products/reports",
        destination: "/admin/reports/products",
        permanent: true,
      },
      {
        source: "/admin/suppliers/reports",
        destination: "/admin/reports/suppliers",
        permanent: true,
      },
    ];
  },
  experimental: {
    serverActions: {
      // Email attachments allow 10 MB in total; product images allow 5 MB. This
      // sits above it because the limit applies to the whole multipart body,
      // including boundaries and part headers. The refusal a person reads
      // should be ours, naming the size, not the framework's.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
