import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@open-geo-console/crawler-rules",
    "@open-geo-console/log-parser",
    "@open-geo-console/geo-auditor"
  ]
};

export default nextConfig;
