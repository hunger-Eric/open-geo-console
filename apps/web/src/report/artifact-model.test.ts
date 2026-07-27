import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

const mocks = vi.hoisted(() => ({
  getAiReport: vi.fn(), getGeoReport: vi.fn(), getRecommendation: vi.fn(), getSourceForensic: vi.fn(), listEvidenceAssets: vi.fn()
}));
vi.mock("@/db/ai-reports", () => ({ getAiReport: mocks.getAiReport }));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/recommendation-authority", () => ({ getRecommendationForensicReportForReport: mocks.getRecommendation }));
vi.mock("@/db/source-forensic-reports", () => ({ getSourceForensicReportForReport: mocks.getSourceForensic }));
vi.mock("@/db/evidence-assets", () => ({ listEvidenceAssets: mocks.listEvidenceAssets }));

import { loadPrivateReportArtifact } from "./artifact-model";

describe("private artifact model product isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "en" });
    mocks.listEvidenceAssets.mockResolvedValue([]);
    mocks.getRecommendation.mockResolvedValue(null);
    mocks.getSourceForensic.mockResolvedValue(null);
  });

  it("dispatches an exact V2 methodology without exposing a V1 fallback", async () => {
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    mocks.getSourceForensic.mockResolvedValue({ version:2, methodology:"public_search_source_forensics_v1", jobId:"v2-job", locale:"zh-CN" });
    mocks.getAiReport.mockResolvedValue({ jobId:"v2-job", technicalPayload:{url:"https://example.com"} });
    const result=await loadPrivateReportArtifact("report-1","recommendation_forensics_v1");
    expect(result).toMatchObject({productContract:"recommendation_forensics_v1",reportVersion:2,fulfillmentMethodology:"public_search_source_forensics_v1"});
  });

  it("loads only the legacy foundation for legacy scope", async () => {
    mocks.getAiReport.mockResolvedValue({ isPrivate: true, jobId: "legacy-job", payload: { legacy: true }, technicalPayload: { url: "https://example.com" } });
    const result = await loadPrivateReportArtifact("report-1", "legacy_website_audit_v1");
    expect(result?.productContract).toBe("legacy_website_audit_v1");
    expect(mocks.getAiReport).toHaveBeenCalledWith("report-1", "deep", "legacy_website_audit_v1");
    expect(mocks.getRecommendation).not.toHaveBeenCalled();
  });

  it("requires a same-job recommendation foundation and never falls back to legacy", async () => {
    mocks.getRecommendation.mockResolvedValue({ jobId: "new-job", provenanceAndLimitations: { locale: "en" } });
    mocks.getAiReport.mockResolvedValue({ isPrivate: true, jobId: "legacy-job", payload: { legacy: true }, technicalPayload: { url: "https://example.com" } });
    await expect(loadPrivateReportArtifact("report-1", "recommendation_forensics_v1")).resolves.toBeNull();
    expect(mocks.getAiReport).toHaveBeenCalledWith("report-1", "deep", "recommendation_forensics_v1");
  });
});
