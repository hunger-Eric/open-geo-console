import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyReportAccessToken = vi.hoisted(() => vi.fn());
vi.mock("@/db/report-tokens", () => ({ verifyReportAccessToken }));

import { reportAccessCookieName, requestHasReportAccess, resolveRequestArtifactScope, scopedReportAccessCookieHeader } from "./report-access";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-LEGACY-01
describe("artifact-scoped report access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the legacy cookie stable and assigns a separate recommendation cookie", () => {
    expect(reportAccessCookieName("report-1", "legacy_website_audit_v1")).toBe("ogc_report_report-1");
    expect(reportAccessCookieName("report-1", "recommendation_forensics_v1")).toBe("ogc_report_report-1_recommendation");
    expect(reportAccessCookieName("report-1", "combined_geo_report_v2")).toBe("ogc_report_report-1_combined_v2");
    expect(reportAccessCookieName("report-1", "combined_geo_report_v3")).toBe("ogc_report_report-1_combined_v3");
    expect(reportAccessCookieName("report-1", "combined_geo_report_v4")).toBe("ogc_report_report-1_combined_v4");
  });

  it("grants and prioritizes only the exact V4 scope before V3", async () => {
    verifyReportAccessToken.mockImplementation(async (token: string) => token === "v4-token"
      ? { reportId: "report-1", artifactScope: "combined_geo_report_v4" }
      : { reportId: "report-1", artifactScope: "combined_geo_report_v3" });
    const request = new Request("https://example.test/reports/report-1/report.html", {
      headers: { cookie: "ogc_report_report-1_combined_v3=v3-token; ogc_report_report-1_combined_v4=v4-token" }
    });

    await expect(requestHasReportAccess(request, "report-1", "combined_geo_report_v4")).resolves.toBe(true);
    await expect(resolveRequestArtifactScope(request, "report-1")).resolves.toBe("combined_geo_report_v4");
    expect(verifyReportAccessToken).toHaveBeenLastCalledWith("v4-token");
    expect(scopedReportAccessCookieHeader(request, "report-1", "combined_geo_report_v4"))
      .toBe("ogc_report_report-1_combined_v4=v4-token");
  });

  it("rejects a V3 token stored in the independent V4 cookie", async () => {
    verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "combined_geo_report_v3" });
    const request = new Request("https://example.test/reports/report-1/report.html", {
      headers: { cookie: "ogc_report_report-1_combined_v4=v3-token" }
    });

    await expect(requestHasReportAccess(request, "report-1", "combined_geo_report_v4")).resolves.toBe(false);
  });

  it("grants and prioritizes only the exact V3 scope", async () => {
    verifyReportAccessToken.mockImplementation(async (token: string) => token === "v3-token"
      ? { reportId: "report-1", artifactScope: "combined_geo_report_v3" }
      : { reportId: "report-1", artifactScope: "combined_geo_report_v2" });
    const request = new Request("https://example.test/reports/report-1/report.html", {
      headers: { cookie: "ogc_report_report-1_combined_v2=v2-token; ogc_report_report-1_combined_v3=v3-token" }
    });
    await expect(requestHasReportAccess(request,"report-1","combined_geo_report_v3")).resolves.toBe(true);
    await expect(resolveRequestArtifactScope(request,"report-1")).resolves.toBe("combined_geo_report_v3");
  });

  it("returns no artifact scope for an anonymous request", async () => {
    await expect(resolveRequestArtifactScope(new Request("https://example.test/reports/report-1/report.html"),"report-1")).resolves.toBeNull();
    expect(verifyReportAccessToken).not.toHaveBeenCalled();
  });

  it("rejects a legacy token before recommendation artifact loading", async () => {
    verifyReportAccessToken.mockResolvedValue({ reportId: "report-1", artifactScope: "legacy_website_audit_v1" });
    const request = new Request("https://example.test/reports/report-1/report.html", {
      headers: { cookie: "ogc_report_report-1_recommendation=legacy-token" }
    });
    await expect(requestHasReportAccess(request, "report-1", "recommendation_forensics_v1")).resolves.toBe(false);
  });

  it("prefers a valid persisted recommendation scope when both cookies exist", async () => {
    verifyReportAccessToken.mockImplementation(async (token: string) => token === "new-token"
      ? { reportId: "report-1", artifactScope: "recommendation_forensics_v1" }
      : { reportId: "report-1", artifactScope: "legacy_website_audit_v1" });
    const request = new Request("https://example.test/reports/report-1/report.html", {
      headers: { cookie: "ogc_report_report-1=old-token; ogc_report_report-1_recommendation=new-token" }
    });
    await expect(resolveRequestArtifactScope(request, "report-1")).resolves.toBe("recommendation_forensics_v1");
    expect(scopedReportAccessCookieHeader(request, "report-1", "recommendation_forensics_v1")).toBe("ogc_report_report-1_recommendation=new-token");
    expect(scopedReportAccessCookieHeader(request, "report-1", "legacy_website_audit_v1")).toBe("ogc_report_report-1=old-token");
  });
});
