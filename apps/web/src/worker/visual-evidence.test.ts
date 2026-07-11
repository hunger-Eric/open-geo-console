import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import { describe, expect, it } from "vitest";
import { buildVisualEvidenceRequests, visualEvidenceHash } from "./visual-evidence";

const report = {
  tier: "deep",
  findings: [{
    id: "finding-1",
    severity: "critical",
    pageElement: "main",
    evidence: [{ url: "https://example.com/page#part", quote: "  A verified   quote  " }]
  }],
  provenance: { contentHash: "report-hash" }
} as unknown as AiWebsiteReportV1;

describe("visual evidence requests", () => {
  it("binds verified citations to crawled content and inherited page elements", () => {
    const [request] = buildVisualEvidenceRequests(report, [{
      url: "https://example.com/page",
      contentHash: "page-hash"
    }]);

    expect(request.contentHash).toBe("page-hash");
    expect(request.citation.pageElement).toBe("main");
    expect(request.citationIndex).toBe(0);
  });

  it("normalizes URL fragments and quote whitespace in the evidence hash", () => {
    const [first] = buildVisualEvidenceRequests(report, [{ url: "https://example.com/page", contentHash: "page-hash" }]);
    const [second] = buildVisualEvidenceRequests({
      ...report,
      findings: [{ ...report.findings[0], evidence: [{ url: "https://example.com/page", quote: "a verified quote" }] }]
    }, [{ url: "https://example.com/page", contentHash: "page-hash" }]);

    expect(visualEvidenceHash(first)).toBe(visualEvidenceHash(second));
  });
});
