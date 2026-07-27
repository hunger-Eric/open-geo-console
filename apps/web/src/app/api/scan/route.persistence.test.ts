import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admitFreeScan: vi.fn(),
  createSiteKey: vi.fn(() => "example.com"),
  verifyTurnstile: vi.fn()
}));

vi.mock("@open-geo-console/site-crawler", () => ({ createSiteKey: mocks.createSiteKey }));
vi.mock("@/db/scan-admission", () => ({ admitFreeScan: mocks.admitFreeScan }));
vi.mock("@/security/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));

import { POST } from "./route";

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/scan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "scan-request-1234567890",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

describe("scan API durable admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCEL_ENV;
    delete process.env.OGC_DEPLOYMENT_PROFILE;
    delete process.env.OGC_STAGING_FREE_SITE_LIMIT;
    delete process.env.COMMERCE_MODE;
    process.env.OGC_IP_HASH_SECRET = "ip-hash-secret-with-at-least-32-characters";
    mocks.verifyTurnstile.mockResolvedValue({ success: true, errorCodes: [] });
    mocks.admitFreeScan.mockResolvedValue({
      outcome: "created", reportId: "report-1", jobId: "job-1", aiEnabled: true
    });
  });

  it("admits the selected locale without crawling in the web request", async () => {
    const response = await POST(request({ url: "https://example.com", locale: "zh" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ reportId: "report-1", jobId: "job-1", status: "queued" });
    expect(mocks.admitFreeScan).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.com/",
      siteKey: "example.com",
      locale: "zh",
      forceFresh: false,
      dailyDistinctSiteLimit: 2
    }));
  });

  it("returns a reused report without creating a second destination", async () => {
    mocks.admitFreeScan.mockResolvedValue({ outcome: "reused", reportId: "report-old", jobId: "job-old" });

    const response = await POST(request({ url: "https://example.com", locale: "en" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reportId: "report-old", jobId: "job-old", status: "reused" });
  });

  it("returns the active staging regeneration on a duplicate click", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    mocks.admitFreeScan.mockResolvedValue({
      outcome: "active_regeneration",
      reportId: "report-new",
      activeReportId: "report-old",
      jobId: "job-new"
    });

    const response = await POST(request({ url: "https://example.com", locale: "en", forceFresh: true }));

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      reportId: "report-new", activeReportId: "report-old", jobId: "job-new", status: "regenerating"
    });
  });

  it("keeps production at two despite request and staging-variable tricks", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.OGC_STAGING_FREE_SITE_LIMIT = "100";
    const response = await POST(new Request("https://example.test/api/scan?OGC_STAGING_FREE_SITE_LIMIT=100", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "scan-request-1234567890",
        cookie: "OGC_DEPLOYMENT_PROFILE=staging; OGC_STAGING_FREE_SITE_LIMIT=100",
        "x-ogc-deployment-profile": "staging"
      },
      body: JSON.stringify({ url: "https://example.com", locale: "en" })
    }));

    expect(response.status).toBe(202);
    expect(mocks.admitFreeScan).toHaveBeenCalledWith(expect.objectContaining({ dailyDistinctSiteLimit: 2 }));
  });

  it("returns a localizable error when the rolling free limit is reached", async () => {
    mocks.admitFreeScan.mockResolvedValue({
      outcome: "rate_limited", retryAfter: new Date("2026-07-11T10:00:00.000Z")
    });

    const response = await POST(request({ url: "https://example.com", locale: "zh" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("x-ogc-client-ip-source")).toBe("fallback");
    expect(await response.json()).toMatchObject({
      errorKey: "freePreviewLimitReached",
      retryAfter: "2026-07-11T10:00:00.000Z"
    });
  });

  it("rejects a missing idempotency key before admission", async () => {
    const response = await POST(new Request("https://example.test/api/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", locale: "en" })
    }));

    expect(response.status).toBe(400);
    expect(mocks.admitFreeScan).not.toHaveBeenCalled();
  });
});
