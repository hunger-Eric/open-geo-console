import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { buildStandaloneReportDocument, reportDownloadDisposition } from "./report-scope";

describe("buildStandaloneReportDocument", () => {
  it("assembles a standalone HTML document with inlined artifact CSS and markup", () => {
    const markup = '<main data-report-version="4">Customer report body</main>';
    const document = buildStandaloneReportDocument(markup);
    expect(document.startsWith("<!doctype html>")).toBe(true);
    expect(document).toContain(`<style>${ARTIFACT_CSS}</style>`);
    expect(document).toContain(markup);
    expect(document).toContain("<html>");
    expect(document).toContain("</html>");
  });
});

describe("reportDownloadDisposition", () => {
  it("uses the attachment geo-report-<id>.html filename format", () => {
    expect(reportDownloadDisposition("report-123")).toBe('attachment; filename="geo-report-report-123.html"');
  });
});
