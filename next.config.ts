import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  
  // No rewrites needed - Caddy gateway handles the proxying
  // Frontend will use XTransformPort query param for backend requests
};

export default nextConfig;
