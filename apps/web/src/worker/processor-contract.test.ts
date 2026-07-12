import { describe, expect, it } from "vitest";
import type { AiReportRow, ScanJobRow } from "@/db/schema";
import {
  isMatchingRecommendationWebsiteFoundation,
  resolveRecommendationFoundationTarget
} from "./processor";

describe("recommendation website-foundation resume contract", () => {
  it("reuses only the same new-product job/report/locale deep appendix", () => {
    const job = { id: "job-1", reportId: "report-1", locale: "en", productContract: "recommendation_forensics_v1" } as ScanJobRow;
    const foundation = { jobId: "job-1", reportId: "report-1", locale: "en", tier: "deep", payload: { tier: "deep", targetUrl: "https://example.com/" } } as AiReportRow;
    expect(isMatchingRecommendationWebsiteFoundation(job, "https://example.com/", foundation)).toBe(true);
    expect(isMatchingRecommendationWebsiteFoundation(job, "https://example.com/", { ...foundation, jobId: "legacy-job" })).toBe(false);
    expect(isMatchingRecommendationWebsiteFoundation({ ...job, productContract: "legacy_website_audit_v1" }, "https://example.com/", foundation)).toBe(false);
  });

  it("uses the discovered canonical root instead of the originally submitted path on restart", () => {
    const job = { id: "job-1", reportId: "report-1", locale: "en", productContract: "recommendation_forensics_v1" } as ScanJobRow;
    const foundation = { jobId: "job-1", reportId: "report-1", locale: "en", tier: "deep", payload: { tier: "deep", targetUrl: "https://x.example/" } } as AiReportRow;
    const target = resolveRecommendationFoundationTarget({
      discoverySnapshot: { targetUrl: "https://x.example/", candidates: [], robotsPolicy: { rules: [], sitemaps: [] }, estimatedPages: 1 }
    }, foundation, "https://x.example/a");
    expect(target).toBe("https://x.example/");
    expect(isMatchingRecommendationWebsiteFoundation(job, target, foundation)).toBe(true);
  });
});
