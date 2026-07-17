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

describe("Report V4 Batch B prohibited-operation entry wiring", () => {
  it("maps every Batch B guard site to its declared production entry", () => {
    const expected = [
      ["provider_claim", "apps/web/src/worker/provider-discovery-production.ts", "extractClaims"],
      ["qualification", "apps/web/src/worker/provider-discovery-production.ts", "createProductionProviderDiscoveryContext.dependencies.qualify"],
      ["four_snapshot", "apps/web/src/worker/provider-discovery-pipeline.ts", "runProviderDiscoveryPipeline"]
    ] as const;

    for (const [site, file, symbol] of expected) {
      const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find((candidate) => candidate.guardSite === site);
      expect(entry).toMatchObject({ guardSite: site, module: file, symbol });
      const text = source(file);
      expect(text.match(new RegExp(`guardSite:\\s*"${site}"`, "gu"))).toHaveLength(1);
    }
  });

  it("keeps each Batch B guard directly outside the real delegate", () => {
    const production = source("apps/web/src/worker/provider-discovery-production.ts");
    expect(production.indexOf('guardSite: "provider_claim"'))
      .toBeLessThan(production.indexOf("delegate: () => extractClaimsUnsafe(request)"));
    expect(production.indexOf('guardSite: "qualification"'))
      .toBeLessThan(production.indexOf("delegate: () => policy.qualify({ claims: values })"));

    const pipeline = source("apps/web/src/worker/provider-discovery-pipeline.ts");
    expect(pipeline.indexOf('guardSite: "four_snapshot"'))
      .toBeLessThan(pipeline.indexOf("delegate: () => runProviderDiscoveryPipelineUnsafe(input)"));
  });
});

describe("Report V4 Batch C prohibited-operation entry wiring", () => {
  it("maps every Batch C guard site exactly once to its declared production entry", () => {
    const expected = [
      ["replacement_prepare", "apps/web/src/db/report-replacement-fulfillments.ts", "prepareApprovedReportReplacement"],
      ["replacement_resume", "apps/web/src/db/report-replacement-fulfillments.ts", "resumeApprovedReplacementModelRepair"],
      ["replacement_terminalize", "apps/web/src/db/combined-replacement-terminalization.ts", "terminalizeCombinedReplacement"],
      ["correction_prepare", "apps/web/src/db/report-corrections.ts", "prepareApprovedReportCorrection"],
      ["correction_confirm", "apps/web/src/db/report-corrections.ts", "confirmApprovedReportCorrection"],
      ["correction_terminalize", "apps/web/src/db/combined-correction-terminalization.ts", "terminalizeCombinedCorrection"]
    ] as const;

    for (const [site, file, symbol] of expected) {
      const entry = REPORT_V4_PROHIBITED_OPERATION_MANIFEST_ENTRIES.find((candidate) => candidate.guardSite === site);
      expect(entry).toMatchObject({ guardSite: site, module: file, symbol });
      expect(source(file).match(new RegExp(`guardSite:\\s*"${site}"`, "gu"))).toHaveLength(1);
    }
  });

  it("keeps each Batch C guard directly outside its private unsafe delegate", () => {
    const replacements = source("apps/web/src/db/report-replacement-fulfillments.ts");
    expect(replacements.indexOf('guardSite: "replacement_prepare"'))
      .toBeLessThan(replacements.indexOf("delegate: () => prepareApprovedReportReplacementUnsafe(input)"));
    expect(replacements.indexOf('guardSite: "replacement_resume"'))
      .toBeLessThan(replacements.indexOf("delegate: () => resumeApprovedReplacementModelRepairUnsafe(input)"));

    const replacementTerminalization = source("apps/web/src/db/combined-replacement-terminalization.ts");
    expect(replacementTerminalization.indexOf('guardSite: "replacement_terminalize"'))
      .toBeLessThan(replacementTerminalization.indexOf("delegate: () => terminalizeCombinedReplacementUnsafe(input)"));

    const corrections = source("apps/web/src/db/report-corrections.ts");
    expect(corrections.indexOf('guardSite: "correction_prepare"'))
      .toBeLessThan(corrections.indexOf("delegate: () => prepareApprovedReportCorrectionUnsafe()"));
    expect(corrections.indexOf('guardSite: "correction_confirm"'))
      .toBeLessThan(corrections.indexOf("delegate: () => confirmApprovedReportCorrectionUnsafe(input)"));

    const correctionTerminalization = source("apps/web/src/db/combined-correction-terminalization.ts");
    expect(correctionTerminalization.indexOf('guardSite: "correction_terminalize"'))
      .toBeLessThan(correctionTerminalization.indexOf("delegate: () => terminalizeCombinedCorrectionUnsafe(input)"));
    expect(correctionTerminalization.match(/guardSite:/gu)).toHaveLength(1);
  });
});
