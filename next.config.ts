import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Comptroller uses dynamic route handlers (ledger reads + live FX) and the
   * node runtime (node:sqlite), which are incompatible with cacheComponents. */
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
