import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectReportAccessToken: vi.fn(),
  redeemReportAccessToken: vi.fn(),
  getGeoReport: vi.fn()
}));

vi.mock("@/db/report-tokens", () => ({
  inspectReportAccessToken: mocks.inspectReportAccessToken,
  redeemReportAccessToken: mocks.redeemReportAccessToken
}));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));

import { GET, POST } from "./route";

describe("private report access locale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET validates but does not consume or set a cookie", async () => {
    mocks.inspectReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });

    const response = await GET(
      new Request("https://example.test/api/reports/report-1/access?token=secret"),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("安全打开报告");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.redeemReportAccessToken).not.toHaveBeenCalled();
  });

  it("POST consumes the token, sets a report cookie, and removes token material from the redirect", async () => {
    mocks.redeemReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    const response = await POST(
      new Request("https://example.test/api/reports/report-1/access", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
      }),
      { params: Promise.resolve({ id: "report-1" }) }
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/zh/reports/report-1/analysis");
    expect(response.headers.get("location")).not.toContain("secret");
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1=secret");
  });

  it("sets only the persisted token scope and ignores client scope fields", async () => {
    mocks.redeemReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "recommendation_forensics_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "en" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=secret&artifactScope=legacy_website_audit_v1"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_recommendation=secret");
    expect(response.headers.get("set-cookie")).not.toContain("ogc_report_report-1=secret");
    expect(response.headers.get("location")).toBe("https://example.test/reports/report-1/report.html");
  });

  it("does not silently default a legacy report to English", async () => {
    mocks.inspectReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: null });

    const response = await GET(
      new Request("https://example.test/api/reports/report-1/access?token=secret"),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(response.status).toBe(409);
  });
});
