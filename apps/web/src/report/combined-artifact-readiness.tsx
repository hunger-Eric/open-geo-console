import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { requireReadyCombinedGeoReport, type CombinedBusinessQuestionAnswers, type CombinedGeoReportV1, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { ReportEvidenceAssetRow } from "@/db/schema";
import type { CombinedPrivateReportArtifactModel } from "./artifact-model";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { ARTIFACT_CSS } from "./artifact-styles";
import { exportCanonicalArtifactHtmlPdf } from "./pdf-export";
import { createEvidenceStorage, evidenceStorageKey } from "@/evidence/storage";

export interface ReadyCombinedArtifact {
  report: CombinedGeoReportV1;
  html: string;
  pdf: Buffer;
  htmlSha256: string;
  pdfSha256: string;
  pdfStorageKey: string;
  pageCount: number;
}

export async function buildReadyCombinedArtifact(input: {
  artifactRevisionId: string;
  artifactRevision: number;
  reportId: string;
  orderId: string;
  jobId: string;
  originalPaidJobId: string;
  targetUrl: string;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
  businessQuestionSet: ConfirmedBusinessQuestionSet;
  businessQuestionAnswers: CombinedBusinessQuestionAnswers;
  publicSourceForensics: RecommendationForensicReportV2;
}): Promise<ReadyCombinedArtifact> {
  if (input.evidenceAssets.some((asset) => asset.status !== "ready" || !asset.contentHash || !asset.storageKey)) {
    throw new Error("Every combined-report screenshot must be ready before artifact activation.");
  }
  const storage = createEvidenceStorage();
  for (const asset of input.evidenceAssets) {
    const stored = await storage.get(asset.storageKey!);
    if (!stored?.body.byteLength || !stored.contentType.startsWith("image/")) {
      throw new Error("Every combined-report screenshot must remain readable before artifact activation.");
    }
  }
  const forensic = input.publicSourceForensics;
  const report = requireReadyCombinedGeoReport({
    version: 1,
    artifactContract: "combined_geo_report_v1",
    productCode: "recommendation_forensics_v1",
    artifactRevisionId: input.artifactRevisionId,
    artifactRevision: input.artifactRevision,
    reportId: input.reportId,
    orderId: input.orderId,
    jobId: input.jobId,
    originalPaidJobId: input.originalPaidJobId,
    targetUrl: input.targetUrl,
    locale: forensic.locale,
    region: forensic.region,
    generatedAt: forensic.generatedAt,
    evidenceCutoffAt: forensic.evidenceCutoffAt,
    technicalInputIdentity: sha(JSON.stringify({ technical: input.technicalReport, ai: input.aiReport.provenance.contentHash })),
    questionSetIdentity: input.businessQuestionSet.id,
    technicalFoundation: {
      technicalReport: input.technicalReport,
      aiReport: input.aiReport,
      evidenceAssets: input.evidenceAssets.filter((asset) => asset.status === "ready" && asset.contentHash).map((asset) => ({
        assetId: asset.id,
        jobId: asset.jobId,
        sourceUrl: asset.sourceUrl,
        kind: asset.kind,
        contentHash: asset.contentHash!
      }))
    },
    businessQuestionSet: input.businessQuestionSet,
    businessQuestionAnswers: input.businessQuestionAnswers,
    publicSourceForensics: forensic,
    vendorTaskPackage: { version: "combined-vendor-task-v1", tasks: forensic.vendorTaskPackage.tasks },
    methodology: {
      htmlCanonical: true,
      publicSearchSurface: `${forensic.authority.surface.surfaceId}/${forensic.authority.surface.surfaceVersion}`,
      technicalCoverage: `${input.technicalReport.pages.length} technical pages; ${input.aiReport.coverage.analyzedPages}/${input.aiReport.coverage.plannedPages} AI-analyzed pages`,
      evidenceFreshness: `${forensic.customerCostDisclosure.freshness}; cutoff ${forensic.evidenceCutoffAt}`,
      limitations: [...new Set([...input.aiReport.coverage.limitations, ...forensic.limitations])],
      nonCausal: true
    }
  });
  const locale: "en" | "zh" = report.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const model = { productContract: "combined_geo_report_v1" as const, reportId: input.reportId, locale,
    combinedReport: report, technicalReport: input.technicalReport, evidenceAssets: input.evidenceAssets,
    artifactRevisionId: input.artifactRevisionId, pdfStorageKey: "pending" };
  const html = renderCanonicalCombinedArtifactHtml(model);
  for (const required of [report.artifactRevisionId,
    ...report.businessQuestionSet.questions.map((question) => question.privateText),
    ...report.businessQuestionAnswers!.answers.flatMap((answer) => [answer.answer,
      ...answer.sourceEvidenceIds.map((evidenceId) => report.publicSourceForensics.sourceGraph.evidence.find((evidence) => evidence.evidenceId === evidenceId)?.canonicalUrl ?? "")]),
    ...report.technicalFoundation.technicalReport.findings.map(({ title }) => title),
    ...report.technicalFoundation.technicalReport.pages.map(({ url }) => url),
    ...report.technicalFoundation.aiReport.findings.map(({ title }) => title),
    ...report.vendorTaskPackage.tasks.map(({ title }) => title)]) {
    if (!html.includes(required)) throw new Error("Combined HTML artifact failed completeness readiness.");
  }
  const pdf = await exportCanonicalArtifactHtmlPdf(html);
  if (pdf.subarray(0, 5).toString("utf8") !== "%PDF-") throw new Error("Combined PDF artifact has an invalid signature.");
  const pageCount = Math.max(0, pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0);
  if (pageCount < 5) throw new Error(`Combined PDF artifact is not substantive (${pageCount} pages).`);
  const pdfStorageKey = evidenceStorageKey(input.reportId, input.artifactRevisionId, "pdf");
  await storage.put(pdfStorageKey, pdf, "application/pdf");
  return { report, html, pdf, htmlSha256: sha(html), pdfSha256: sha(pdf), pdfStorageKey, pageCount };
}

export function renderCanonicalCombinedArtifactHtml(model: CombinedPrivateReportArtifactModel):string{
  const markup=renderToStaticMarkup(createElement(CombinedGeoReportArtifact,{model}));
  return `<!doctype html><html lang="${model.locale}"><head><meta charset="utf-8"/><style>${ARTIFACT_CSS}</style></head><body>${markup}</body></html>`;
}

function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
