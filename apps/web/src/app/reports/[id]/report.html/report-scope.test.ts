import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}), { virtual: true });

import { ARTIFACT_CSS } from "@/report/artifact-styles";
import type { ReportEvidenceAssetRow } from "@/db/schema";
import type { EvidenceStorage } from "@/evidence/storage";
import { buildStandaloneReportDocument, inlineEvidenceImages, reportDownloadDisposition } from "./report-scope";

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

describe("inlineEvidenceImages", () => {
  const pngBytes = new Uint8Array([1, 2, 3]);
  const pngBase64 = Buffer.from(pngBytes).toString("base64");

  function asset(overrides: Partial<ReportEvidenceAssetRow> = {}): ReportEvidenceAssetRow {
    return { id: "asset-1", reportId: "report-1", status: "ready", storageKey: "reports/report-1/evidence/asset-1.webp", ...overrides } as ReportEvidenceAssetRow;
  }

  function storage(object: { body: Uint8Array; contentType: string } | null): EvidenceStorage {
    return { provider: "filesystem", get: vi.fn(async () => object), put: vi.fn(), delete: vi.fn() };
  }

  it("replaces both API src patterns with a base64 data URL for ready assets", async () => {
    const markup =
      '<img src="/api/reports/report-1/evidence/asset-1" alt="a"/>' +
      '<img src="/api/reports/report-1/evidence/recommendation/asset-1" alt="b"/>';
    const result = await inlineEvidenceImages(markup, "report-1", [asset()], storage({ body: pngBytes, contentType: "image/webp" }));
    const dataUrl = `data:image/webp;base64,${pngBase64}`;
    expect(result).toBe(`<img src="${dataUrl}" alt="a"/><img src="${dataUrl}" alt="b"/>`);
  });

  it("keeps the API src when the asset is not ready or has no storage key", async () => {
    const markup = '<img src="/api/reports/report-1/evidence/asset-1" alt="a"/>';
    const pending = await inlineEvidenceImages(markup, "report-1", [asset({ status: "pending" })], storage({ body: pngBytes, contentType: "image/webp" }));
    const noKey = await inlineEvidenceImages(markup, "report-1", [asset({ storageKey: null })], storage({ body: pngBytes, contentType: "image/webp" }));
    expect(pending).toBe(markup);
    expect(noKey).toBe(markup);
  });

  it("keeps the API src when storage misses or throws, and skips storage when the src is absent", async () => {
    const markup = '<img src="/api/reports/report-1/evidence/asset-1" alt="a"/>';
    const missing = await inlineEvidenceImages(markup, "report-1", [asset()], storage(null));
    const failing = await inlineEvidenceImages(markup, "report-1", [asset()], {
      provider: "filesystem", get: vi.fn(async () => { throw new Error("boom"); }), put: vi.fn(), delete: vi.fn()
    });
    expect(missing).toBe(markup);
    expect(failing).toBe(markup);

    const absent = storage({ body: pngBytes, contentType: "image/webp" });
    const untouched = await inlineEvidenceImages("<p>no images</p>", "report-1", [asset()], absent);
    expect(untouched).toBe("<p>no images</p>");
    expect(absent.get).not.toHaveBeenCalled();
  });
});
