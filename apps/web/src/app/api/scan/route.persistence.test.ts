import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditSite: vi.fn(),
  createSiteKey: vi.fn(() => "example.com"),
  enqueueScanJob: vi.fn(),
  saveGeoReport: vi.fn(),
  deleteGeoReport: vi.fn(),
  claimFreeSiteTrial: vi.fn(),
  attachFreeTrialJob: vi.fn(),
  consumeFreeAiDailyBudget: vi.fn(),
  getActiveFreeSiteTrial: vi.fn(),
  safeFetch: vi.fn()
}));

vi.mock("@open-geo-console/geo-auditor", () => ({ auditSite: mocks.auditSite }));
vi.mock("@open-geo-console/site-crawler", () => ({ createSiteKey: mocks.createSiteKey }));
vi.mock("@/db/jobs", () => ({ enqueueScanJob: mocks.enqueueScanJob }));
vi.mock("@/db/reports", () => ({ saveGeoReport: mocks.saveGeoReport, deleteGeoReport: mocks.deleteGeoReport }));
vi.mock("@/db/trials", () => ({
  claimFreeSiteTrial: mocks.claimFreeSiteTrial,
  getActiveFreeSiteTrial: mocks.getActiveFreeSiteTrial,
  attachFreeTrialJob: mocks.attachFreeTrialJob
}));
vi.mock("@/db/commercial-budget", () => ({ consumeFreeAiDailyBudget: mocks.consumeFreeAiDailyBudget }));
vi.mock("@/server/safe-fetch", () => ({ createSafeFetch: () => mocks.safeFetch }));

import { POST } from "./route";

describe("scan API locale persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(await response.json()).toMatchObject({
      errorKey: "freePreviewLimitReached",
      retryAfter: "2026-07-11T10:00:00.000Z"
    });
  });
});
