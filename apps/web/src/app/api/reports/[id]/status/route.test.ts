import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiReport: vi.fn(),
  getActiveCombinedGeoReport: vi.fn(),
  getJobCreditStatus: vi.fn(),
  getLatestScanJob: vi.fn(),
  getScanJobQueueStatus: vi.fn(),
  getGeoReport: vi.fn(),
  getReportV4PreAdmissionJob: vi.fn(),
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
vi.mock("@/db/report-v4-admission-jobs", () => ({ getReportV4PreAdmissionJob: mocks.getReportV4PreAdmissionJob }));
vi.mock("@/worker/report-v4-free-teaser", () => ({
  freeTeaserCheckpointFromJobCheckpoint: (checkpoint: { freeTeaser?: unknown } | null | undefined) => checkpoint?.freeTeaser ?? null,
  parseReadyFreeTeaserCheckpoint: (
    checkpoint: { stage?: string; semanticReview?: unknown; reviewedFoundation?: unknown; directAnalysisStatus?: unknown },
    options?: { semanticReviewContractVersion?: string | null; freeDirectSemanticsVersion?: string | null }
  ) => {
    if (checkpoint.stage !== "ready") throw new TypeError("not ready");
    // Marker-absent path: options omitted (undefined) — legacy ready is stage-only.
    if (options === undefined) return checkpoint;
    if (options.freeDirectSemanticsVersion === "free-v4-direct-semantics-v1") {
      if (checkpoint.directAnalysisStatus !== "completed" && checkpoint.directAnalysisStatus !== "incomplete") throw new TypeError("missing Direct analysis status");
      return checkpoint;
    }
    const markerPresent = options.semanticReviewContractVersion === "report-semantic-review-v1";
    if (!markerPresent) throw new TypeError("unsupported contract");
    if (!checkpoint.semanticReview) throw new TypeError("root semantic-review lineage");
    if (!checkpoint.reviewedFoundation) throw new TypeError("missing reviewed foundation");
    return checkpoint;
  }
}));
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
    mocks.getReportV4PreAdmissionJob.mockResolvedValue(null);
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
    expect(mocks.getLatestScanJob).toHaveBeenCalledWith("report-1", "deep", {
      excludeReasons: ["v4_pre_admission"]
    });
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
    expect(mocks.getLatestScanJob).toHaveBeenCalledWith("report-1", "free", {
      excludeReasons: ["v4_pre_admission"]
    });
  });

  it("keeps V4 free-report progress monotonic across the pre-admission handoff", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    const freeJob = {
      ...deepJob,
      id: "free-job",
      tier: "free",
      stage: "synthesizing",
      executionState: "running",
      progress: 85,
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4
    };
    mocks.getLatestScanJob.mockImplementation(async (_id: string, tier: string) => tier === "free" ? freeJob : null);

    const beforeHandoff = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await beforeHandoff.json()).toMatchObject({ job: { stage: "synthesizing", progress: 65 } });

    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      stage: "queued",
      executionState: "queued",
      progress: 0,
      checkpoint: {}
    });
    const atHandoff = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await atHandoff.json()).toMatchObject({ job: { stage: "queued", progress: 65 } });

    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      stage: "discovering",
      executionState: "running",
      progress: 5,
      checkpoint: {}
    });
    const afterHandoff = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await afterHandoff.json()).toMatchObject({ job: { stage: "discovering", progress: 67 } });
  });

  it("keeps raw progress for a legacy single-stage free report", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getLatestScanJob.mockImplementation(async (_id: string, tier: string) => tier === "free" ? {
      ...deepJob,
      id: "legacy-free-job",
      tier: "free",
      stage: "synthesizing",
      executionState: "running",
      progress: 85,
      fulfillmentMethodology: null,
      recommendationReportVersion: null
    } : null);
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await response.json()).toMatchObject({ job: { progress: 85 } });
  });

  it("keeps a completed homepage preview pending while its teaser checkpoint is incomplete", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockResolvedValue({ locale: "zh", payload: { tier: "free" } });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      stage: "synthesizing",
      executionState: "running",
      progress: 96,
      checkpoint: { freeTeaser: { stage: "q1_answer_ready" } }
    });
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await response.json()).toMatchObject({
      hasAiReport: false,
      job: { stage: "synthesizing", state: "generating", progress: 98 }
    });
  });

  it("clears public progress for a failed free teaser so 96% is not advertised as generating", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockResolvedValue(null);
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      stage: "failed",
      executionState: "failed",
      progress: 96,
      checkpoint: { freeTeaser: { stage: "q1_answer_ready" } }
    });
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    const body = await response.json();
    expect(body).toMatchObject({
      hasAiReport: false,
      job: {
        stage: "failed",
        state: "unavailable",
        progress: null
      }
    });
    expect(body.job.progress).not.toBe(96);
  });

  it("exposes anonymous teaser readiness only from the persisted ready checkpoint", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockResolvedValue({ locale: "zh", payload: { tier: "free" } });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      checkpoint: { freeTeaser: { stage: "ready" } }
    });
    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await response.json()).toMatchObject({
      hasAiReport: true,
      job: { stage: "completed", progress: 100 }
    });
  });

  it("keeps checkout eligible when a ready Direct teaser has incomplete analysis", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockResolvedValue({ locale: "zh", payload: { tier: "free" } });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      checkpoint: {
        freeDirectSemanticsVersion: "free-v4-direct-semantics-v1",
        freeTeaser: { stage: "ready", directAnalysisStatus: "incomplete" }
      }
    });

    const response = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await response.json()).toMatchObject({
      hasAiReport: true,
      freeTeaser: { ready: true, coreReady: true, analysisStatus: "incomplete", checkoutEligible: true }
    });
  });

  it("treats marker-present ready only when root marker matches reviewed free teaser projection", async () => {
    mocks.resolveRequestArtifactScope.mockResolvedValue(null);
    mocks.getAiReport.mockResolvedValue({ locale: "zh", payload: { tier: "free" } });
    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      checkpoint: {
        semanticReviewContractVersion: "report-semantic-review-v1",
        freeTeaser: {
          stage: "ready",
          semanticReview: { version: "report-semantic-review-v1" },
          reviewedFoundation: { organizationProfile: { organizationName: "凌顺" } }
        }
      }
    });
    const ready = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await ready.json()).toMatchObject({ hasAiReport: true });

    mocks.getReportV4PreAdmissionJob.mockResolvedValue({
      ...deepJob,
      id: "teaser-job",
      reason: "v4_pre_admission",
      checkpoint: {
        semanticReviewContractVersion: "report-semantic-review-v1",
        freeTeaser: { stage: "ready" }
      }
    });
    const missingReview = await GET(new Request("https://example.test/api/reports/report-1/status"), {
      params: Promise.resolve({ id: "report-1" })
    });
    expect(await missingReview.json()).toMatchObject({ hasAiReport: false });
  });
});
