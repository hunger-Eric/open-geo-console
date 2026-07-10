import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@open-geo-console/ai-report-engine",
    "@open-geo-console/crawler-rules",
    "@open-geo-console/log-parser",
    "@open-geo-console/geo-auditor",
    "@open-geo-console/site-crawler"
  ]
};

export default nextConfig;
