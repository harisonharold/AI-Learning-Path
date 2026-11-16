import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: new URL("../..", import.meta.url).pathname,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@atlas/ui"],
  typedRoutes: false,
  async rewrites() {
    return [{ source: "/healthz", destination: "/api/healthz" }];
  },
};

export default config;
