import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The extraction mirror is reference material only — never part of the build.
  outputFileTracingExcludes: {
    "*": ["./extraction/**/*"],
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
