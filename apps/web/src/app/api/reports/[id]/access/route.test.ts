import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyReportAccessToken: vi.fn(),
  getGeoReport: vi.fn()
}));

vi.mock("@/db/report-tokens", () => ({
  verifyReportAccessToken: mocks.verifyReportAccessToken
}));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));

import { GET, POST } from "./route";

describe("private report access locale", () => {
  beforeEach(() => vi.clearAllMocks());
  it("GET validates but does not consume or set a cookie", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });

    const response = await GET(
      new Request("https://example.test/api/reports/report-1/access?token=secret"),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("安全打开报告");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.verifyReportAccessToken).toHaveBeenCalledWith("secret");
  });

  it("POST verifies the token, sets a report cookie, and removes token material from the redirect", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
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

  it("keeps the emailed link reusable: a second open still confirms and redeems", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    const open = () => POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
    }), { params: Promise.resolve({ id: "report-1" }) });
    const first = await open();
    const second = await open();
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(second.headers.get("set-cookie")).toContain("ogc_report_report-1=secret");
    expect(mocks.verifyReportAccessToken).toHaveBeenCalledTimes(2);
  });

  it("sets only the persisted token scope and ignores client scope fields", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "recommendation_forensics_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "en" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "token=secret&artifactScope=legacy_website_audit_v1"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_recommendation=secret");
    expect(response.headers.get("set-cookie")).not.toContain("ogc_report_report-1=secret");
    expect(response.headers.get("location")).toBe("https://example.test/reports/report-1/report.html");
  });

  it("redirects the persisted combined V2 scope to the canonical HTML artifact", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "combined_geo_report_v2", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.headers.get("location")).toBe("https://example.test/reports/report-1/report.html");
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_combined_v2=secret");
  });

  it("redirects the persisted combined V3 scope to the canonical HTML artifact", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "combined_geo_report_v3", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.headers.get("location")).toBe("https://example.test/reports/report-1/report.html");
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_combined_v3=secret");
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-PDF-01
  it("redirects the persisted combined V4 scope to the canonical HTML artifact without a PDF surface", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "combined_geo_report_v4", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/reports/report-1/report.html");
    expect(response.headers.get("location")).not.toMatch(/pdf/i);
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_combined_v4=secret");
  });

  // @requirement GEO-V4-COMMERCE-01
  it("rejects an anonymous or wrong-report redemption without setting access", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({
      reportId: "another-report",
      artifactScope: "combined_geo_report_v4",
      expiresAt: new Date("2026-08-01T00:00:00Z")
    });
    const anonymous = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token="
    }), { params: Promise.resolve({ id: "report-1" }) });
    const wrongReport = await POST(new Request("https://example.test/api/reports/report-1/access", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "token=secret"
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(anonymous.status).toBe(403);
    expect(wrongReport.status).toBe(403);
    expect(anonymous.headers.get("set-cookie")).toBeNull();
    expect(wrongReport.headers.get("set-cookie")).toBeNull();
    expect(mocks.verifyReportAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.verifyReportAccessToken).toHaveBeenCalledWith("secret");
    expect(mocks.getGeoReport).not.toHaveBeenCalled();
  });

  it("does not silently default a legacy report to English", async () => {
    mocks.verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.getGeoReport.mockResolvedValue({ reportLocale: null });

    const response = await GET(
      new Request("https://example.test/api/reports/report-1/access?token=secret"),
      { params: Promise.resolve({ id: "report-1" }) }
    );

    expect(response.status).toBe(409);
  });
});
