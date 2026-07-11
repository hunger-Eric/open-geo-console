import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium"],
  outputFileTracingIncludes: {
    "/api/reports/[id]/artifacts/report.pdf": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
      "./node_modules/playwright-core/browsers.json"
    ]
  },
  transpilePackages: [
    "@open-geo-console/ai-report-engine",
    "@open-geo-console/crawler-rules",
    "@open-geo-console/log-parser",
    "@open-geo-console/geo-auditor",
    "@open-geo-console/site-crawler"
  ],
  async headers() {
    return [{
      source: "/reports/:id/report.html",
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" }
      ]
    }];
  }
};

export default nextConfig;
