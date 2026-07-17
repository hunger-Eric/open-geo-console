import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES } from "./prohibited-operation-manifest";

function source(path: string): string { return readFileSync(join(process.cwd(), path), "utf8"); }

describe("Report V4 Batch A prohibited-operation entry wiring", () => {
  it("maps every Batch A guard site to its declared symbol and facade", () => {
    const expected = [
      ["pdf_export_url", "apps/web/src/report/pdf-export.ts", "exportReportPdf"],
      ["pdf_export_html", "apps/web/src/report/pdf-export.ts", "exportCanonicalArtifactHtmlPdf"],
      ["pdf_readiness_chromium", "apps/web/src/report/combined-artifact-readiness.tsx", "materializeReadyArtifact"],
      ["pdf_readiness_storage", "apps/web/src/report/combined-artifact-readiness.tsx", "materializeReadyArtifact"],
      ["full_report_rerun", "apps/web/src/worker/processor.ts", "processScanJob"],
      ["legacy_mutation", "apps/web/src/db/reports.ts", "saveGeoReport"]
    ] as const;
    for (const [site, file, symbol] of expected) {
      const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find((candidate) => candidate.guardSite === site);
      expect(entry).toMatchObject({ guardSite: site, module: file, symbol });
      const text = source(file);
      expect(text).toContain("runReportV4GuardedOperation");
      expect(text).toContain(symbol);
      expect(text.match(new RegExp(`guardSite:\\s*"${site}"`, "gu"))).toHaveLength(1);
    }
  });

  it("keeps each guard immediately outside its declared side-effect delegate", () => {
    const pdf = source("apps/web/src/report/pdf-export.ts");
    expect(pdf.indexOf('guardSite: "pdf_export_url"')).toBeLessThan(pdf.indexOf("exportReportPdfUnsafe(input)"));
    expect(pdf.indexOf('guardSite: "pdf_export_html"')).toBeLessThan(pdf.indexOf("exportCanonicalArtifactHtmlPdfUnsafe(html)"));

    const readiness = source("apps/web/src/report/combined-artifact-readiness.tsx");
    expect(readiness.indexOf('guardSite: "pdf_readiness_chromium"')).toBeLessThan(readiness.indexOf("exportCanonicalArtifactHtmlPdf(html)"));
    expect(readiness.indexOf('guardSite: "pdf_readiness_storage"')).toBeLessThan(readiness.indexOf("storage.put(pdfStorageKey"));

    const processor = source("apps/web/src/worker/processor.ts");
    expect(processor.indexOf("if (reportV4ProductionTarget)"))
      .toBeLessThan(processor.indexOf('guardSite: "full_report_rerun"'));
    expect(processor.indexOf('guardSite: "full_report_rerun"'))
      .toBeLessThan(processor.indexOf("fetchPlannedPagesWithRecovery<StoredPageEvidence>"));

    const reports = source("apps/web/src/db/reports.ts");
    expect(reports.indexOf('guardSite: "legacy_mutation"')).toBeLessThan(reports.indexOf("saveGeoReportUnsafe(url"));
  });
});
