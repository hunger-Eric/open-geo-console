import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });
const mocks = vi.hoisted(() => ({
  requestHasReportAccess: vi.fn(), scopedReportAccessCookieHeader: vi.fn(),
  loadPrivateReportArtifact: vi.fn(), exportReportPdf: vi.fn()
}));
vi.mock("@/server/report-access", () => ({
  requestHasReportAccess: mocks.requestHasReportAccess,
  scopedReportAccessCookieHeader: mocks.scopedReportAccessCookieHeader
}));
vi.mock("./artifact-model", () => ({ loadPrivateReportArtifact: mocks.loadPrivateReportArtifact }));
vi.mock("./pdf-export", () => ({ exportReportPdf: mocks.exportReportPdf }));

import { serveScopedReportPdf } from "./pdf-artifact-route";

describe("hard-scoped PDF artifact route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exportReportPdf.mockResolvedValue(Buffer.from("%PDF fixture"));
  });

  it("denies the wrong scope before any artifact DB read", async () => {
    mocks.requestHasReportAccess.mockResolvedValue(false);
    const response = await serveScopedReportPdf({
      request: requestWithBothCookies(), reportId: "report-1", artifactScope: "legacy_website_audit_v1",
      htmlPath: "/reports/report-1/legacy-report.html", filename: "legacy.pdf"
    });
    expect(response.status).toBe(404);
    expect(mocks.loadPrivateReportArtifact).not.toHaveBeenCalled();
    expect(mocks.exportReportPdf).not.toHaveBeenCalled();
  });

  it.each([
    ["legacy_website_audit_v1", "/reports/report-1/legacy-report.html", "ogc_report_report-1=legacy-token"],
    ["recommendation_forensics_v1", "/reports/report-1/recommendation-report.html", "ogc_report_report-1_recommendation=new-token"]
  ] as const)("exports only the %s HTML path with its scoped cookie", async (artifactScope, htmlPath, cookieHeader) => {
    mocks.requestHasReportAccess.mockResolvedValue(true);
    mocks.scopedReportAccessCookieHeader.mockReturnValue(cookieHeader);
    mocks.loadPrivateReportArtifact.mockResolvedValue({ productContract: artifactScope });
    const response = await serveScopedReportPdf({
      request: requestWithBothCookies(), reportId: "report-1", artifactScope, htmlPath, filename: "report.pdf"
    });
    expect(response.status).toBe(200);
    expect(mocks.loadPrivateReportArtifact).toHaveBeenCalledWith("report-1", artifactScope);
    expect(mocks.exportReportPdf).toHaveBeenCalledWith({ htmlUrl: `https://example.test${htmlPath}`, cookieHeader });
    expect(mocks.exportReportPdf.mock.calls[0]![0].cookieHeader).not.toContain(artifactScope === "legacy_website_audit_v1" ? "new-token" : "legacy-token");
  });
});

function requestWithBothCookies() {
  return new Request("https://example.test/api/reports/report-1/artifacts/report.pdf", {
    headers: { cookie: "ogc_report_report-1=legacy-token; ogc_report_report-1_recommendation=new-token" }
  });
}
