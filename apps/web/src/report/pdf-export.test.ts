import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });
import { isControlledReportArtifactUrl } from "./pdf-export";

describe("isControlledReportArtifactUrl", () => {
  it.each([
    "/reports/report-1/report.html",
    "/reports/report-1/legacy-report.html",
    "/reports/report-1/recommendation-report.html"
  ])("allows the controlled artifact path %s", (pathname) => {
    expect(isControlledReportArtifactUrl(new URL(pathname, "https://example.test"))).toBe(true);
  });

  it.each([
    "/reports/report-1/other-report.html",
    "/reports/report-1/recommendation-report.html/extra",
    "/api/reports/report-1/artifacts/recommendation-report.pdf"
  ])("rejects the uncontrolled path %s", (pathname) => {
    expect(isControlledReportArtifactUrl(new URL(pathname, "https://example.test"))).toBe(false);
  });
});
