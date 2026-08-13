import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The extraction mirror is reference material only — never part of the build.
  outputFileTracingExcludes: {
    "*": ["./extraction/**/*"],
  },
};

export default nextConfig;
