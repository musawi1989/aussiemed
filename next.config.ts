import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
      // Product image uploads post through a server action, and the default
      // ceiling is 1 MB. MAX_IMAGE_BYTES in src/lib/storage.ts is 5 MB; this
      // sits above it because the limit applies to the whole multipart body,
      // including boundaries and part headers. The refusal a person reads
      // should be ours, naming the size, not the framework's.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
