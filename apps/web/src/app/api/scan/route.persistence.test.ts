import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditSite: vi.fn(),
  createSiteKey: vi.fn(() => "example.com"),
  enqueueScanJob: vi.fn(),
  saveGeoReport: vi.fn(),
  deleteGeoReport: vi.fn(),
  claimFreeSiteTrial: vi.fn(),
  attachFreeTrialJob: vi.fn(),
  attachStagingFreeRegeneration: vi.fn(),
  beginStagingFreeRegeneration: vi.fn(),
  cancelStagingFreeRegeneration: vi.fn(),
  completeStagingFreeRegenerationWithoutJob: vi.fn(),
  consumeFreeAiDailyBudget: vi.fn(),
  getActiveFreeSiteTrial: vi.fn(),
  safeFetch: vi.fn()
}));

vi.mock("@open-geo-console/geo-auditor", () => ({ auditSite: mocks.auditSite }));
vi.mock("@open-geo-console/site-crawler", () => ({ createSiteKey: mocks.createSiteKey }));
vi.mock("@/db/jobs", () => ({
  enqueueScanJob: mocks.enqueueScanJob,
  ScanJobCapacityError: class ScanJobCapacityError extends Error {}
}));
vi.mock("@/db/reports", () => ({ saveGeoReport: mocks.saveGeoReport, deleteGeoReport: mocks.deleteGeoReport }));
vi.mock("@/db/trials", () => ({
  claimFreeSiteTrial: mocks.claimFreeSiteTrial,
  getActiveFreeSiteTrial: mocks.getActiveFreeSiteTrial,
  attachFreeTrialJob: mocks.attachFreeTrialJob,
  attachStagingFreeRegeneration: mocks.attachStagingFreeRegeneration,
  beginStagingFreeRegeneration: mocks.beginStagingFreeRegeneration,
  cancelStagingFreeRegeneration: mocks.cancelStagingFreeRegeneration,
  completeStagingFreeRegenerationWithoutJob: mocks.completeStagingFreeRegenerationWithoutJob
}));
vi.mock("@/db/commercial-budget", () => ({ consumeFreeAiDailyBudget: mocks.consumeFreeAiDailyBudget }));
vi.mock("@/server/safe-fetch", () => ({ createSafeFetch: () => mocks.safeFetch }));

import { POST } from "./route";

describe("scan API locale persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCEL_ENV;
    delete process.env.OGC_DEPLOYMENT_PROFILE;
    delete process.env.OGC_STAGING_FREE_SITE_LIMIT;
    delete process.env.COMMERCE_MODE;
    process.env.OGC_IP_HASH_SECRET = "ip-hash-secret-with-at-least-32-characters";
    mocks.getActiveFreeSiteTrial.mockResolvedValue(null);
    mocks.safeFetch.mockResolvedValue(new Response("", {
      status: 200,
      headers: { "x-ogc-final-url": "https://example.com/" }
    }));
    mocks.auditSite.mockResolvedValue({ score: 82 });
    mocks.saveGeoReport.mockResolvedValue({ id: "report-1" });
    mocks.enqueueScanJob.mockResolvedValue({ id: "job-1" });
    mocks.claimFreeSiteTrial.mockResolvedValue({ outcome: "created", reportId: "report-1", jobId: "job-1" });
    mocks.attachFreeTrialJob.mockResolvedValue(true);
    mocks.attachStagingFreeRegeneration.mockResolvedValue(true);
    mocks.cancelStagingFreeRegeneration.mockResolvedValue(true);
    mocks.completeStagingFreeRegenerationWithoutJob.mockResolvedValue(true);
    mocks.consumeFreeAiDailyBudget.mockResolvedValue({ granted: true, usedCount: 1, limit: 50 });
  });

  it("persists and enqueues the same explicitly selected locale", async () => {
    const response = await POST(new Request("https://example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "zh" })
    }));

    expect(response.status).toBe(202);
    expect(mocks.saveGeoReport).toHaveBeenCalledWith(
      "https://example.com/",
      { score: 82 },
      "example.com",
      undefined,
      "zh"
    );
    expect(mocks.enqueueScanJob).toHaveBeenCalledWith({ reportId: "report-1", tier: "free", locale: "zh" });
    expect(mocks.claimFreeSiteTrial).toHaveBeenCalledWith(expect.objectContaining({ dailyDistinctSiteLimit: 2 }));
  });

  it("creates one distinct staging regeneration without replacing the active trial first", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    mocks.getActiveFreeSiteTrial.mockResolvedValue({ reportId: "report-old", jobId: "job-old" });
    mocks.beginStagingFreeRegeneration.mockResolvedValue({
      outcome: "created", reservationId: "reservation-1", reportId: null, jobId: null
    });

    const response = await POST(new Request("https://preview.example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "en", forceFresh: true })
    }));

    expect(response.status).toBe(202);
    expect(mocks.claimFreeSiteTrial).not.toHaveBeenCalled();
    expect(mocks.enqueueScanJob).toHaveBeenCalledWith({
      reportId: "report-1",
      tier: "free",
      locale: "en",
      reason: "staging_regeneration",
      maxActiveTierJobs: 2
    });
    expect(mocks.attachStagingFreeRegeneration).toHaveBeenCalledWith({
      siteKey: "example.com", reservationId: "reservation-1", reportId: "report-1", jobId: "job-1"
    });
    expect(mocks.attachFreeTrialJob).not.toHaveBeenCalled();
  });

  it("returns the active staging regeneration on a duplicate click", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    mocks.getActiveFreeSiteTrial.mockResolvedValue({ reportId: "report-old", jobId: "job-old" });
    mocks.beginStagingFreeRegeneration.mockResolvedValue({
      outcome: "active", reservationId: "reservation-1", reportId: "report-new", jobId: "job-new"
    });

    const response = await POST(new Request("https://preview.example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "en", forceFresh: true })
    }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      reportId: "report-new", activeReportId: "report-old", jobId: "job-new", status: "regenerating"
    });
    expect(mocks.auditSite).not.toHaveBeenCalled();
    expect(mocks.enqueueScanJob).not.toHaveBeenCalled();
  });

  it("keeps production at two despite request and staging-variable tricks", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.OGC_STAGING_FREE_SITE_LIMIT = "100";
    const response = await POST(new Request("https://example.test/api/scan?OGC_STAGING_FREE_SITE_LIMIT=100", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "OGC_DEPLOYMENT_PROFILE=staging; OGC_STAGING_FREE_SITE_LIMIT=100",
        "x-ogc-deployment-profile": "staging"
      },
      body: JSON.stringify({ url: "https://example.com", locale: "en" })
    }));
    expect(response.status).toBe(202);
    expect(mocks.claimFreeSiteTrial).toHaveBeenCalledWith(expect.objectContaining({ dailyDistinctSiteLimit: 2 }));
  });

  it("removes only the failed staging regeneration and its new report", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    mocks.getActiveFreeSiteTrial.mockResolvedValue({ reportId: "report-old", jobId: "job-old" });
    mocks.beginStagingFreeRegeneration.mockResolvedValue({
      outcome: "created", reservationId: "reservation-1", reportId: null, jobId: null
    });
    mocks.enqueueScanJob.mockRejectedValue(new Error("queue unavailable"));
    const response = await POST(new Request("https://preview.example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "en", forceFresh: true })
    }));
    expect(response.status).toBe(400);
    expect(mocks.cancelStagingFreeRegeneration).toHaveBeenCalledWith("example.com", "reservation-1");
    expect(mocks.deleteGeoReport).toHaveBeenCalledWith("report-1");
    expect(mocks.attachFreeTrialJob).not.toHaveBeenCalled();
  });

  it("keeps the technical report but does not enqueue model work after the global budget is exhausted", async () => {
    mocks.consumeFreeAiDailyBudget.mockResolvedValue({ granted: false, usedCount: 50, limit: 50 });
    const response = await POST(new Request("https://example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "en" })
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reportId: "report-1", jobId: null, status: "technical_only" });
    expect(mocks.enqueueScanJob).not.toHaveBeenCalled();
  });

  it("returns a localizable error key when the rolling free limit is reached", async () => {
    mocks.claimFreeSiteTrial.mockResolvedValue({
      outcome: "rate_limited",
      retryAfter: new Date("2026-07-11T10:00:00.000Z")
    });

    const response = await POST(new Request("https://example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "zh" })
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("x-ogc-client-ip-source")).toBe("fallback");
    expect(await response.json()).toMatchObject({
      errorKey: "freePreviewLimitReached",
      retryAfter: "2026-07-11T10:00:00.000Z"
    });
  });
});
