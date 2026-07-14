import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

const mocks = vi.hoisted(() => ({
  getAiReport: vi.fn(), getGeoReport: vi.fn(), getRecommendation: vi.fn(), getSourceForensic: vi.fn(), getActiveCombined: vi.fn(), listEvidenceAssets: vi.fn()
}));
vi.mock("@/db/ai-reports", () => ({ getAiReport: mocks.getAiReport }));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/recommendation-authority", () => ({ getRecommendationForensicReportForReport: mocks.getRecommendation }));
vi.mock("@/db/source-forensic-reports", () => ({ getSourceForensicReportForReport: mocks.getSourceForensic }));
vi.mock("@/db/combined-reports", () => ({ getActiveCombinedGeoReport: mocks.getActiveCombined }));
vi.mock("@/db/evidence-assets", () => ({ listEvidenceAssets: mocks.listEvidenceAssets }));

import { loadPrivateReportArtifact } from "./artifact-model";

describe("private artifact model product isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "en" });
    mocks.listEvidenceAssets.mockResolvedValue([]);
    mocks.getRecommendation.mockResolvedValue(null);
    mocks.getSourceForensic.mockResolvedValue(null);
    mocks.getActiveCombined.mockResolvedValue(null);
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

  it("loads an active V2 artifact only under its exact access scope", async () => {
    const report={artifactContract:"combined_geo_report_v2",locale:"zh-CN",technicalFoundation:{technicalReport:{url:"https://example.com"},evidenceAssets:[]}};
    mocks.getActiveCombined.mockResolvedValue({artifactRevisionId:"revision-v2",pdfStorageKey:"private.pdf",report});
    await expect(loadPrivateReportArtifact("report-1","combined_geo_report_v2")).resolves.toMatchObject({productContract:"combined_geo_report_v2",locale:"zh",artifactRevisionId:"revision-v2"});
    await expect(loadPrivateReportArtifact("report-1","combined_geo_report_v1")).resolves.toBeNull();
  });

  it("loads an active V3 artifact only under its exact access scope", async () => {
    const report={artifactContract:"combined_geo_report_v3",locale:"zh-CN",technicalFoundation:{technicalReport:{url:"https://example.com"},evidenceAssets:[]}};
    mocks.getActiveCombined.mockResolvedValue({artifactRevisionId:"revision-v3",pdfStorageKey:"private.pdf",report});
    await expect(loadPrivateReportArtifact("report-1","combined_geo_report_v3")).resolves.toMatchObject({productContract:"combined_geo_report_v3",locale:"zh",artifactRevisionId:"revision-v3"});
    await expect(loadPrivateReportArtifact("report-1","combined_geo_report_v2")).resolves.toBeNull();
  });

  it("requires a same-job recommendation foundation and never falls back to legacy", async () => {
    mocks.getRecommendation.mockResolvedValue({ jobId: "new-job", provenanceAndLimitations: { locale: "en" } });
    mocks.getAiReport.mockResolvedValue({ isPrivate: true, jobId: "legacy-job", payload: { legacy: true }, technicalPayload: { url: "https://example.com" } });
    await expect(loadPrivateReportArtifact("report-1", "recommendation_forensics_v1")).resolves.toBeNull();
    expect(mocks.getAiReport).toHaveBeenCalledWith("report-1", "deep", "recommendation_forensics_v1");
  });
});
