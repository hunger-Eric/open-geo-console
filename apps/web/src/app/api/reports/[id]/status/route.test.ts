import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiReport: vi.fn(),
  getActiveCombinedGeoReport: vi.fn(),
  getJobCreditStatus: vi.fn(),
  getLatestScanJob: vi.fn(),
  getScanJobQueueStatus: vi.fn(),
  getGeoReport: vi.fn(),
  resolveRequestArtifactScope: vi.fn()
}));

vi.mock("@/db/ai-reports", () => ({ getAiReport: mocks.getAiReport }));
vi.mock("@/db/combined-reports", () => ({ getActiveCombinedGeoReport: mocks.getActiveCombinedGeoReport }));
vi.mock("@/db/jobs", () => ({
  getJobCreditStatus: mocks.getJobCreditStatus,
  getLatestScanJob: mocks.getLatestScanJob,
  getScanJobQueueStatus: mocks.getScanJobQueueStatus
}));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/server/report-access", () => ({ resolveRequestArtifactScope: mocks.resolveRequestArtifactScope }));

import { GET } from "./route";

const report = {
  id: "report-1",
  reportLocale: "zh",
  payload: { url: "https://example.com/" },
  technicalStatus: "completed",
  technicalErrorCode: null,
  technicalPublicError: null,
  localeCorrectionUsedAt: null
};
const deepJob = {
  id: "job-v4",
  reportId: "report-1",
  tier: "deep",
  reason: "standard",
  stage: "completed",
  executionState: "completed",
  progress: 100,
  plannedPages: 3,
  successfulPages: 3,
  failedPages: 0
};

describe("report status artifact scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGeoReport.mockResolvedValue(report);
    mocks.getLatestScanJob.mockImplementation(async (_id: string, tier: string) => tier === "deep" ? deepJob : null);
    mocks.getScanJobQueueStatus.mockResolvedValue(null);
    mocks.getJobCreditStatus.mockResolvedValue("settled");
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-PDF-01
  it("uses the exact active V4 artifact as status truth without reading a legacy AI report", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue("combined_geo_report_v4");
    mocks.getActiveCombinedGeoReport.mockResolvedValue({
      artifactContract: "combined_geo_report_v4",
      report: { artifactContract: "combined_geo_report_v4", locale: "zh-CN" }
    });
    const response = await GET(new Request("https://example.test/api/reports/report-1/status", {
      headers: { cookie: "ogc_report_report-1_combined_v4=secret" }
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      hasDeepAccess: true,
      hasAiReport: true,
      aiReportLocale: "zh",
      job: { tier: "deep", stage: "completed" }
    });
    expect(mocks.resolveRequestArtifactScope).toHaveBeenCalledWith(expect.any(Request), "report-1");
    expect(mocks.getActiveCombinedGeoReport).toHaveBeenCalledWith("report-1", "combined_geo_report_v4");
    expect(mocks.getAiReport).not.toHaveBeenCalled();
  });

  // @requirement GEO-V4-COMMERCE-01
  it("preserves legacy scoped status behavior and does not probe the V4 artifact", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue("legacy_website_audit_v1");
    mocks.getAiReport.mockImplementation(async (_id: string, tier: string) => tier === "deep"
      ? { locale: "en", payload: { tier: "deep" } }
      : null);
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hasDeepAccess: true, hasAiReport: true, aiReportLocale: "en" });
    expect(mocks.getActiveCombinedGeoReport).not.toHaveBeenCalled();
    expect(mocks.getAiReport).toHaveBeenCalledWith("report-1", "deep");
  });

  it("keeps anonymous status limited to public preview truth", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockImplementation(async (_id: string, tier: string) => tier === "free"
      ? { locale: "zh", payload: { tier: "free" } }
      : null);
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ hasDeepAccess: false, hasAiReport: true, aiReportLocale: "zh" });
    expect(mocks.getActiveCombinedGeoReport).not.toHaveBeenCalled();
    expect(mocks.getLatestScanJob).not.toHaveBeenCalledWith("report-1", "deep");
  });
});
