import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assertCombinedGeoReportLanguage, GEO_TERMINOLOGY_POLICY, requireReadyCombinedGeoReport, requireReadyCombinedGeoReportV2, requireReadyCombinedGeoReportV3, restoreAllowedDomainTerms, type CombinedBusinessQuestionAnswers, type CombinedGeoReportV1, type CombinedGeoReportV2, type CombinedGeoReportV3, type CombinedReportLanguageScope, type GeoArticleDeliverable, type GroundedAnswerEvidence, type GroundedBusinessQuestionAnswersV2, type OpenGeoAnswerCardV3, type OpenGeoEngineProvenanceV3, type PaidV3DirectSemantics, type PaidV3SemanticAnswerCardDraft, type ProviderDiscoveryV1, type RecommendationForensicReportV2, type SourceSelectionDiagnosisV1 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { ReportEvidenceAssetRow } from "@/db/schema";
import type { CombinedPrivateReportArtifactModel, CombinedPrivateReportArtifactModelV1, CombinedPrivateReportArtifactModelV3 } from "./artifact-model";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { CombinedGeoReportV2Artifact } from "@/components/combined-geo-report-v2-artifact";
import { CombinedGeoReportV3Artifact } from "@/components/combined-geo-report-v3-artifact";
import { ARTIFACT_CSS } from "./artifact-styles";
import { exportCanonicalArtifactHtmlPdf } from "./pdf-export";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";
import { localizeTechnicalReportForArtifact } from "./technical-report-localization";
import { createEvidenceStorage, evidenceStorageKey } from "@/evidence/storage";
import type { PaidV3DirectDebugTrace, PaidV3DirectDebugTraceDetails } from "@/worker/paid-v3-direct-debug-trace";

type V3ArtifactReadinessOptions = {
  semanticValidation?: "legacy" | "deferred" | "free_direct";
  reviewedReceiptVerified?: boolean;
  trace?: PaidV3DirectDebugTrace;
};

export interface ReadyCombinedArtifact {
  report: CombinedGeoReportV1;
  html: string;
  pdf: Buffer;
  htmlSha256: string;
  pdfSha256: string;
  pdfStorageKey: string;
  pageCount: number;
}

export interface ReadyCombinedArtifactV2 extends Omit<ReadyCombinedArtifact, "report"> {
  report: CombinedGeoReportV2;
}
export interface ReadyCombinedArtifactV3 extends Omit<ReadyCombinedArtifact, "report"> {
  report: CombinedGeoReportV3;
}

export function combinedArtifactSystemCopy(locale: string, input: {
  technicalPages: number;
  analyzedPages: number;
  plannedPages: number;
  failedPages: number;
  freshness: "fresh" | "mixed" | "stale";
  evidenceCutoffAt: string;
}) {
  if (locale.toLowerCase().startsWith("zh")) {
    const freshness = { fresh: "最新", mixed: "混合时效", stale: "陈旧" }[input.freshness];
    return {
      technicalCoverage: `${input.technicalPages} 个技术页面；AI 已分析 ${input.analyzedPages}/${input.plannedPages} 个页面`,
      evidenceFreshness: `${freshness}；证据截止 ${input.evidenceCutoffAt}`,
      samplingMethod: `对 ${input.plannedPages} 个计划页面进行代表性抽样，完成 ${input.analyzedPages} 个页面的分析。`,
      limitations: input.failedPages > 0 ? [`有 ${input.failedPages} 个计划页面未完成分析。`] : []
    };
  }
  const freshness = { fresh: "Fresh", mixed: "Mixed freshness", stale: "Stale" }[input.freshness];
  return {
    technicalCoverage: `${input.technicalPages} technical pages; AI analyzed ${input.analyzedPages}/${input.plannedPages} pages`,
    evidenceFreshness: `${freshness}; evidence cutoff ${input.evidenceCutoffAt}`,
    samplingMethod: `Representative sampling across ${input.plannedPages} planned pages completed analysis for ${input.analyzedPages} pages.`,
    limitations: input.failedPages > 0 ? [`${input.failedPages} planned pages could not be analyzed.`] : []
  };
}

export function localizedProviderDiscoveryLimitation(locale: string, source: string): string {
  return locale.toLowerCase().startsWith("zh")
    ? "缺少公开证据并不证明供应商缺乏某项能力；证据有限的实体仍保留为候选。"
    : source;
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
  languageValidationScope?: CombinedReportLanguageScope;
}): Promise<ReadyCombinedArtifact> {
  await assertReadyEvidenceAssets(input.evidenceAssets);
  const forensic = input.publicSourceForensics;
  const systemCopy = combinedArtifactSystemCopy(forensic.locale, {
    technicalPages: input.technicalReport.pages.length,
    analyzedPages: input.aiReport.coverage.analyzedPages,
    plannedPages: input.aiReport.coverage.plannedPages,
    failedPages: input.aiReport.coverage.failedPages,
    freshness: forensic.customerCostDisclosure.freshness,
    evidenceCutoffAt: forensic.evidenceCutoffAt
  });
  const localizedAiReport = restoreWebsiteReportDomainsForArtifact({
    ...input.aiReport,
    coverage: {
      ...input.aiReport.coverage,
      samplingMethod: systemCopy.samplingMethod,
      limitations: systemCopy.limitations
    }
  }, input.targetUrl);
  const localizedTechnicalReport = localizeTechnicalReportForArtifact(input.technicalReport, forensic.locale);
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
    presentationTerminologyPolicy: GEO_TERMINOLOGY_POLICY,
    targetUrl: input.targetUrl,
    locale: forensic.locale,
    region: forensic.region,
    generatedAt: forensic.generatedAt,
    evidenceCutoffAt: forensic.evidenceCutoffAt,
    technicalInputIdentity: sha(JSON.stringify({ technical: input.technicalReport, ai: input.aiReport.provenance.contentHash })),
    questionSetIdentity: input.businessQuestionSet.id,
    technicalFoundation: {
      technicalReport: localizedTechnicalReport,
      aiReport: localizedAiReport,
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
      technicalCoverage: systemCopy.technicalCoverage,
      evidenceFreshness: systemCopy.evidenceFreshness,
      limitations: [...new Set([...systemCopy.limitations, ...forensic.limitations])],
      nonCausal: true
    }
  });
  assertCombinedGeoReportLanguage(report, input.languageValidationScope);
  const locale: "en" | "zh" = report.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const model = { productContract: "combined_geo_report_v1" as const, reportId: input.reportId, locale,
    combinedReport: report, technicalReport: report.technicalFoundation.technicalReport, evidenceAssets: input.evidenceAssets,
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
  return materializeReadyArtifact(report, model, html);
}

async function assertReadyEvidenceAssets(evidenceAssets: ReportEvidenceAssetRow[]): Promise<void> {
  if (evidenceAssets.some((asset) => asset.status !== "ready" || !asset.contentHash || !asset.storageKey)) {
    throw new Error("Every combined-report screenshot must be ready before artifact activation.");
  }
  const storage = createEvidenceStorage();
  for (const asset of evidenceAssets) {
    const stored = await storage.get(asset.storageKey!);
    if (!stored?.body.byteLength || !stored.contentType.startsWith("image/")) {
      throw new Error("Every combined-report screenshot must remain readable before artifact activation.");
    }
  }
}

export async function materializeReadyArtifact<T extends CombinedGeoReportV1 | CombinedGeoReportV2 | CombinedGeoReportV3>(
  report: T,
  model: CombinedPrivateReportArtifactModel,
  html: string,
  trace?: PaidV3DirectDebugTrace
): Promise<{ report: T; html: string; pdf: Buffer; htmlSha256: string; pdfSha256: string; pdfStorageKey: string; pageCount: number }> {
  const pdf = await traceArtifactStep(trace, "combined_pdf_render", { phase: "artifact_verification" },
    () => runReportV4GuardedOperation({ guardSite: "pdf_readiness_chromium", delegate: () => exportCanonicalArtifactHtmlPdf(html) }));
  const pageCount = traceArtifactGate(trace, "combined_pdf_validation", { phase: "artifact_verification" }, () => {
    if (pdf.subarray(0, 5).toString("utf8") !== "%PDF-") throw new Error("Combined PDF artifact has an invalid signature.");
    const count = Math.max(0, pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0);
    if (count < 5) throw new Error(`Combined PDF artifact is not substantive (${count} pages).`);
    return count;
  });
  const pdfStorageKey = evidenceStorageKey(model.reportId, model.artifactRevisionId, "pdf");
  const storage = createEvidenceStorage();
  await traceArtifactStep(trace, "combined_pdf_storage", { phase: "artifact_verification", pageCount },
    () => runReportV4GuardedOperation({ guardSite: "pdf_readiness_storage", delegate: () => storage.put(pdfStorageKey, pdf, "application/pdf") }));
  return { report, html, pdf, htmlSha256: sha(html), pdfSha256: sha(pdf), pdfStorageKey, pageCount };
}

export async function buildReadyCombinedArtifactV2(input: {
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
  businessQuestionAnswers: GroundedBusinessQuestionAnswersV2;
  groundedAnswerEvidence: GroundedAnswerEvidence[];
  publicSourceForensics: RecommendationForensicReportV2;
  providerDiscovery: ProviderDiscoveryV1;
  languageValidationScope?: CombinedReportLanguageScope;
}): Promise<ReadyCombinedArtifactV2> {
  await assertReadyEvidenceAssets(input.evidenceAssets);
  const forensic = input.publicSourceForensics;
  const systemCopy = combinedArtifactSystemCopy(forensic.locale, {
    technicalPages: input.technicalReport.pages.length,
    analyzedPages: input.aiReport.coverage.analyzedPages,
    plannedPages: input.aiReport.coverage.plannedPages,
    failedPages: input.aiReport.coverage.failedPages,
    freshness: forensic.customerCostDisclosure.freshness,
    evidenceCutoffAt: forensic.evidenceCutoffAt
  });
  const localizedAiReport = restoreWebsiteReportDomainsForArtifact({
    ...input.aiReport,
    coverage: { ...input.aiReport.coverage, samplingMethod: systemCopy.samplingMethod, limitations: systemCopy.limitations }
  }, input.targetUrl);
  const localizedTechnicalReport = localizeTechnicalReportForArtifact(input.technicalReport, forensic.locale);
  const report = requireReadyCombinedGeoReportV2({
    version: 2,
    artifactContract: "combined_geo_report_v2",
    productCode: "recommendation_forensics_v1",
    artifactRevisionId: input.artifactRevisionId,
    artifactRevision: input.artifactRevision,
    reportId: input.reportId,
    orderId: input.orderId,
    jobId: input.jobId,
    originalPaidJobId: input.originalPaidJobId,
    presentationTerminologyPolicy: GEO_TERMINOLOGY_POLICY,
    targetUrl: input.targetUrl,
    locale: forensic.locale,
    region: forensic.region,
    generatedAt: forensic.generatedAt,
    evidenceCutoffAt: forensic.evidenceCutoffAt,
    technicalInputIdentity: sha(JSON.stringify({ technical: input.technicalReport, ai: input.aiReport.provenance.contentHash })),
    questionSetIdentity: input.businessQuestionSet.id,
    technicalFoundation: {
      technicalReport: localizedTechnicalReport,
      aiReport: localizedAiReport,
      evidenceAssets: input.evidenceAssets.filter((asset) => asset.status === "ready" && asset.contentHash).map((asset) => ({
        assetId: asset.id, jobId: asset.jobId, sourceUrl: asset.sourceUrl, kind: asset.kind, contentHash: asset.contentHash!
      }))
    },
    businessQuestionSet: input.businessQuestionSet,
    businessQuestionAnswers: input.businessQuestionAnswers,
    groundedAnswerEvidence: input.groundedAnswerEvidence,
    providerDiscovery: input.providerDiscovery,
    publicSourceForensics: forensic,
    vendorTaskPackage: { version: "combined-vendor-task-v1", tasks: forensic.vendorTaskPackage.tasks },
    methodology: {
      htmlCanonical: true,
      publicSearchSurface: `${forensic.authority.surface.surfaceId}/${forensic.authority.surface.surfaceVersion}`,
      technicalCoverage: systemCopy.technicalCoverage,
      evidenceFreshness: systemCopy.evidenceFreshness,
      limitations: [...new Set([...systemCopy.limitations, ...forensic.limitations, input.providerDiscovery.limitation])],
      nonCausal: true
    }
  });
  assertCombinedGeoReportLanguage({
    ...report,
    version: 1,
    artifactContract: "combined_geo_report_v1",
    businessQuestionAnswers: undefined
  }, input.languageValidationScope);
  const locale: "en" | "zh" = report.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const model: CombinedPrivateReportArtifactModel = {
    productContract: "combined_geo_report_v2", reportId: input.reportId, locale, combinedReport: report,
    technicalReport: report.technicalFoundation.technicalReport, evidenceAssets: input.evidenceAssets,
    artifactRevisionId: input.artifactRevisionId, pdfStorageKey: "pending"
  };
  const html = renderCanonicalCombinedArtifactHtml(model);
  for (const required of [
    report.artifactRevisionId,
    ...report.providerDiscovery.strict.map(({ canonicalName }) => canonicalName),
    ...report.providerDiscovery.candidates.map(({ canonicalName }) => canonicalName),
    ...report.providerDiscovery.evidence.map(({ exactExcerpt }) => clipEvidence(exactExcerpt)),
    ...report.businessQuestionAnswers.answers.flatMap((answer) => answer.claims.map(({ text }) => text))
  ]) if (!html.includes(required)) throw new Error("Combined V2 HTML artifact failed completeness readiness.");
  return materializeReadyArtifact(report, model, html);
}

export function restoreWebsiteReportDomainsForArtifact(report: AiWebsiteReportV1, targetUrl: string): AiWebsiteReportV1 {
  const hostname = new URL(targetUrl).hostname.toLocaleLowerCase().replace(/^www\./u, "");
  const restore = (value: unknown): unknown => {
    if (typeof value === "string") return restoreAllowedDomainTerms(value, [hostname]);
    if (Array.isArray(value)) return value.map(restore);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restore(item)]));
    return value;
  };
  return restore(report) as AiWebsiteReportV1;
}

export interface PrepareCombinedGeoReportV3Input {
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
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  sourceSelectionDiagnosis: SourceSelectionDiagnosisV1;
  engineProvenance: OpenGeoEngineProvenanceV3;
  publicSourceForensics: RecommendationForensicReportV2;
  providerDiscovery: ProviderDiscoveryV1;
  directSemantics?: PaidV3DirectSemantics;
  geoArticleExample?: GeoArticleDeliverable;
  languageValidationScope?: CombinedReportLanguageScope;
}

export interface BuildReadyCombinedArtifactV3Input extends PrepareCombinedGeoReportV3Input {
  onReportPrepared?: (report: CombinedGeoReportV3) => void | Promise<void>;
}

export interface PrepareCombinedGeoReportV3SemanticDraftInput extends Omit<PrepareCombinedGeoReportV3Input, "answerCards" | "sourceSelectionDiagnosis"> {
  answerCards: [PaidV3SemanticAnswerCardDraft, PaidV3SemanticAnswerCardDraft, PaidV3SemanticAnswerCardDraft];
}

export type CombinedGeoReportV3SemanticDraft = Omit<CombinedGeoReportV3, "answerCards" | "sourceSelectionDiagnosis" | "semanticReviewReceipt"> & {
  answerCards: [PaidV3SemanticAnswerCardDraft, PaidV3SemanticAnswerCardDraft, PaidV3SemanticAnswerCardDraft];
};

export async function buildReadyCombinedArtifactV3(
  input: BuildReadyCombinedArtifactV3Input,
  options: V3ArtifactReadinessOptions = {}
): Promise<ReadyCombinedArtifactV3> {
  await traceArtifactStep(options.trace, "combined_evidence_assets", {
    phase: "artifact_verification", assetCount: input.evidenceAssets.length
  }, () => assertReadyEvidenceAssets(input.evidenceAssets));
  const report = traceArtifactGate(options.trace, "combined_report_contract", {
    phase: "artifact_verification"
  }, () => prepareCombinedGeoReportV3Core(input, options));
  if (input.onReportPrepared) await traceArtifactStep(options.trace, "combined_report_checkpoint", {
    phase: "artifact_verification", progress: 99
  }, () => Promise.resolve(input.onReportPrepared!(report)));
  return materializePreparedCombinedArtifactV3(report, input.evidenceAssets, options);
}

export function prepareCombinedGeoReportV3(
  input: PrepareCombinedGeoReportV3Input,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct"; reviewedReceiptVerified?: boolean } = {}
): CombinedGeoReportV3 {
  assertDeferredReceiptAuthority(options);
  return prepareCombinedGeoReportV3Core(input, options);
}

/**
 * Pure pre-review carrier assembly for marker-selected Paid V3 only. It is
 * intentionally not parsed, rendered, materialized, or persisted: Q2/Q3
 * diagnosis, source selection, and the receipt are supplied by the one
 * semantic-review application before the ordinary deferred readiness seam.
 */
export function prepareCombinedGeoReportV3SemanticDraft(
  input: PrepareCombinedGeoReportV3SemanticDraftInput
): CombinedGeoReportV3SemanticDraft {
  return assembleCombinedGeoReportV3(input as unknown as Omit<PrepareCombinedGeoReportV3Input, "sourceSelectionDiagnosis"> & { answerCards: readonly PaidV3SemanticAnswerCardDraft[] }) as CombinedGeoReportV3SemanticDraft;
}

function prepareCombinedGeoReportV3Core(
  input: PrepareCombinedGeoReportV3Input,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct" }
): CombinedGeoReportV3 {
  const assembled = assembleCombinedGeoReportV3(input);
  const report = requireReadyCombinedGeoReportV3(assembled, { semanticValidation: options.semanticValidation ?? "legacy" });
  if ((options.semanticValidation ?? "legacy") === "legacy") {
    assertCombinedGeoReportLanguage(
      { ...report, version: 1, artifactContract: "combined_geo_report_v1", businessQuestionAnswers: undefined },
      input.languageValidationScope
    );
  }
  return report;
}

function assembleCombinedGeoReportV3(input: Omit<PrepareCombinedGeoReportV3Input, "sourceSelectionDiagnosis"> & {
  answerCards: readonly PaidV3SemanticAnswerCardDraft[];
  sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
}): Record<string, unknown> {
  const forensic = input.publicSourceForensics;
  const systemCopy = combinedArtifactSystemCopy(forensic.locale, {
    technicalPages: input.technicalReport.pages.length,
    analyzedPages: input.aiReport.coverage.analyzedPages,
    plannedPages: input.aiReport.coverage.plannedPages,
    failedPages: input.aiReport.coverage.failedPages,
    freshness: forensic.customerCostDisclosure.freshness,
    evidenceCutoffAt: forensic.evidenceCutoffAt
  });
  const localizedAiReport = restoreWebsiteReportDomainsForArtifact({
    ...input.aiReport,
    coverage: { ...input.aiReport.coverage, samplingMethod: systemCopy.samplingMethod, limitations: systemCopy.limitations }
  }, input.targetUrl);
  const localizedTechnicalReport = localizeTechnicalReportForArtifact(input.technicalReport, forensic.locale);
  return {
    version: 3,
    artifactContract: "combined_geo_report_v3",
    productCode: "recommendation_forensics_v1",
    artifactRevisionId: input.artifactRevisionId,
    artifactRevision: input.artifactRevision,
    reportId: input.reportId,
    orderId: input.orderId,
    jobId: input.jobId,
    originalPaidJobId: input.originalPaidJobId,
    presentationTerminologyPolicy: GEO_TERMINOLOGY_POLICY,
    targetUrl: input.targetUrl,
    locale: forensic.locale,
    region: forensic.region,
    generatedAt: forensic.generatedAt,
    evidenceCutoffAt: forensic.evidenceCutoffAt,
    technicalInputIdentity: sha(JSON.stringify({ technical: input.technicalReport, ai: input.aiReport.provenance.contentHash })),
    questionSetIdentity: input.businessQuestionSet.id,
    technicalFoundation: {
      technicalReport: localizedTechnicalReport,
      aiReport: localizedAiReport,
      evidenceAssets: input.evidenceAssets.filter((asset) => asset.status === "ready" && asset.contentHash).map((asset) => ({
        assetId: asset.id, jobId: asset.jobId, sourceUrl: asset.sourceUrl, kind: asset.kind, contentHash: asset.contentHash!
      }))
    },
    businessQuestionSet: input.businessQuestionSet,
    answerCards: input.answerCards,
    ...(input.sourceSelectionDiagnosis ? { sourceSelectionDiagnosis: input.sourceSelectionDiagnosis } : {}),
    ...(input.directSemantics ? { directSemantics: input.directSemantics } : {}),
    ...(input.geoArticleExample ? { geoArticleExample: input.geoArticleExample } : {}),
    engineProvenance: input.engineProvenance,
    providerDiscovery: input.providerDiscovery,
    publicSourceForensics: forensic,
    vendorTaskPackage: { version: "combined-vendor-task-v1", tasks: forensic.vendorTaskPackage.tasks },
    methodology: {
      htmlCanonical: true,
      publicSearchSurface: `${forensic.authority.surface.surfaceId}/${forensic.authority.surface.surfaceVersion}`,
      technicalCoverage: systemCopy.technicalCoverage,
      evidenceFreshness: systemCopy.evidenceFreshness,
      limitations: [...new Set([
        ...systemCopy.limitations,
        ...forensic.limitations,
        localizedProviderDiscoveryLimitation(forensic.locale, input.providerDiscovery.limitation)
      ])],
      nonCausal: true
    }
  };
}

export async function materializePreparedCombinedArtifactV3(
  value: unknown,
  evidenceAssets: ReportEvidenceAssetRow[],
  options: V3ArtifactReadinessOptions = {}
): Promise<ReadyCombinedArtifactV3> {
  traceArtifactGate(options.trace, "combined_receipt_authority", { phase: "artifact_verification" }, () => assertDeferredReceiptAuthority(options));
  await traceArtifactStep(options.trace, "combined_evidence_assets", {
    phase: "artifact_verification", assetCount: evidenceAssets.length
  }, () => assertReadyEvidenceAssets(evidenceAssets));
  const report = traceArtifactGate(options.trace, "combined_report_schema", { phase: "artifact_verification" }, () => requireReadyCombinedGeoReportV3(value, {
    semanticValidation: options.semanticValidation ?? "legacy"
  }));
  const locale: "en" | "zh" = report.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const model: CombinedPrivateReportArtifactModelV3 = {
    productContract: "combined_geo_report_v3", reportId: report.reportId, locale, combinedReport: report,
    technicalReport: report.technicalFoundation.technicalReport, evidenceAssets,
    artifactRevisionId: report.artifactRevisionId, pdfStorageKey: "pending"
  };
  const html = traceArtifactGate(options.trace, "combined_html_render", { phase: "artifact_verification" }, () => {
    const rendered = renderCanonicalCombinedArtifactHtml(model);
    assertCombinedV3HtmlCompleteness(report, rendered);
    return rendered;
  });
  return materializeReadyArtifact(report, model, html, options.trace);
}

function traceArtifactStep<T>(trace: PaidV3DirectDebugTrace | undefined, step: string,
  details: PaidV3DirectDebugTraceDetails, operation: () => Promise<T>): Promise<T> {
  return trace ? trace.span(step, details, operation) : operation();
}

function traceArtifactGate<T>(trace: PaidV3DirectDebugTrace | undefined, step: string,
  details: PaidV3DirectDebugTraceDetails, operation: () => T): T {
  const started = Date.now();
  trace?.emit("step_started", step, details);
  try {
    const value = operation();
    trace?.emit("step_succeeded", step, { ...details, durationMs: Date.now() - started });
    return value;
  } catch (error) {
    trace?.failed(step, { ...details, durationMs: Date.now() - started }, error);
    throw error;
  }
}

function assertDeferredReceiptAuthority(options: { semanticValidation?: "legacy" | "deferred" | "free_direct"; reviewedReceiptVerified?: boolean }): void {
  if (options.semanticValidation === "deferred" && options.reviewedReceiptVerified !== true) {
    throw new TypeError("Deferred Paid V3 artifact handling requires caller-supplied root-bound receipt verification.");
  }
}

export function assertCombinedV3HtmlCompleteness(report: CombinedGeoReportV3, html: string): void {
  const directByQuestion = new Map(report.directSemantics?.questions.map((result) => [result.questionId, result]) ?? []);
  const required = [
    report.artifactRevisionId,
    ...report.answerCards.flatMap((card) => {
      const answerContent = card.answerMode === "generative_search_v1"
        ? [card.exactQuestion, card.answerText, card.refusal?.reason ?? "", ...card.sources.flatMap((source) => [source.title, source.registrableDomain, source.canonicalUrl, source.citedText ?? ""])]
        : [card.exactQuestion, ...card.sentences.map(({ text }) => text), ...card.sourceEvidence.flatMap((evidence) => [evidence.title, evidence.registrableDomain, evidence.canonicalUrl, evidence.exactExcerpt, evidence.ownershipCategory, evidence.observedAt])];
      const direct = directByQuestion.get(card.questionId);
      if (direct) {
        return direct.analysisStatus === "completed" && direct.analysis
          ? [...answerContent, direct.analysis.summary, ...direct.analysis.observations, ...direct.analysis.recommendations]
          : answerContent;
      }
      if (card.diagnosis) {
        return [
          ...answerContent,
          card.diagnosis.selectionSummary,
          ...card.diagnosis.observableFactors.map(({ observation }) => observation),
          card.diagnosis.targetGap,
          ...card.diagnosis.recommendedActions.map(({ action }) => action)
        ];
      }
      return [
        ...answerContent,
        ...card.geoDiagnosis.targetRoles,
        ...card.geoDiagnosis.competitorEntityIds,
        ...card.geoDiagnosis.missingEvidenceFamilies,
        card.geoDiagnosis.retestQuestion
      ];
    }),
    ...(report.sourceSelectionDiagnosis ? [
      ...report.sourceSelectionDiagnosis.sourceProfiles.flatMap((profile) => [
        profile.registrableDomain,
        ...profile.contributions.flatMap(({ summary, answerExcerpt, sourceExcerpt }) => [summary, answerExcerpt, sourceExcerpt ?? ""]),
        ...profile.observableFactors.flatMap(({ observation, evidenceExcerpt }) => [observation, evidenceExcerpt ?? ""]),
        ...profile.targetGaps.map(({ comparison }) => comparison)
      ]),
      ...report.sourceSelectionDiagnosis.sharedPatterns.map(({ summary }) => summary),
      ...report.sourceSelectionDiagnosis.targetActions.flatMap(({ title, rationale }) => [title, rationale]),
      ...report.sourceSelectionDiagnosis.limitations.map(({ message }) => message)
    ] : []),
    ...(report.geoArticleExample ? geoArticleVisibleText(report.geoArticleExample) : []),
    ...report.technicalFoundation.technicalReport.findings.flatMap(({ title, description, recommendation }) => [title, description, recommendation]),
    ...report.technicalFoundation.technicalReport.pages.flatMap(({ url, title, canonical, metaDescription, h1 }) => [url, title ?? "", canonical ?? "", metaDescription ?? "", ...h1]),
    ...report.technicalFoundation.aiReport.findings.flatMap(({ title, impact, recommendation }) => [title, impact, recommendation])
  ].filter(Boolean);
  if (required.some((value) => renderedHtmlIndexOf(html, String(value)) < 0)) throw new Error("Combined V3 HTML artifact failed completeness readiness.");
  for (const card of report.answerCards) {
    if (card.answerMode === "generative_search_v1") {
      const answerOrRefusal = card.status === "refused" ? card.refusal!.reason : card.answerText;
      const answerAt = renderedHtmlIndexOf(html, answerOrRefusal);
      const nextQuestionAt = report.answerCards.map(({ exactQuestion }) => renderedHtmlIndexOf(html, exactQuestion)).filter((index) => index > answerAt).sort((a, b) => a - b)[0] ?? html.length;
      for (const source of card.sources) {
        const sourceAt = renderedHtmlIndexOf(html, source.canonicalUrl, answerAt);
        if (sourceAt <= answerAt || sourceAt >= nextQuestionAt) throw new Error("Combined V3 HTML artifact failed answer-first source completeness readiness.");
      }
      continue;
    }
    for (const sentence of card.sentences.filter(({ kind }) => kind === "grounded_claim")) {
      const sentenceAt = renderedHtmlIndexOf(html, sentence.text);
      const nextSentenceAt = report.answerCards.flatMap((candidate) => candidate.answerMode === "generative_search_v1" ? [] : candidate.sentences).map(({ text }) => renderedHtmlIndexOf(html, text)).filter((index) => index > sentenceAt).sort((a, b) => a - b)[0] ?? html.length;
      for (const evidenceId of sentence.evidenceIds) {
        const evidence = card.sourceEvidence.find((candidate) => candidate.evidenceId === evidenceId);
        const evidenceAt = evidence ? renderedHtmlIndexOf(html, evidence.exactExcerpt, sentenceAt) : -1;
        if (!evidence || evidenceAt < sentenceAt || evidenceAt >= nextSentenceAt) throw new Error("Combined V3 HTML artifact failed adjacent citation completeness readiness.");
      }
    }
  }
  for (const [cardIndex, card] of report.answerCards.entries()) {
    if (!card.diagnosis) continue;
    const questionAt = renderedHtmlIndexOf(html, card.exactQuestion);
    const nextQuestion = report.answerCards[cardIndex + 1];
    const cardEnd = nextQuestion ? renderedHtmlIndexOf(html, nextQuestion.exactQuestion, questionAt + 1) : html.length;
    const answerAnchors = card.answerMode === "generative_search_v1"
      ? [card.status === "refused" ? card.refusal!.reason : card.answerText, ...card.sources.map(({ canonicalUrl }) => canonicalUrl)]
      : [...card.sentences.map(({ text }) => text), ...card.sourceEvidence.map(({ exactExcerpt }) => exactExcerpt)];
    const contentEnd = Math.max(questionAt, ...answerAnchors.map((value) => renderedHtmlIndexOf(html, value, questionAt)));
    const diagnosisValues = [
      card.diagnosis.selectionSummary,
      ...card.diagnosis.observableFactors.map(({ observation }) => observation),
      card.diagnosis.targetGap,
      ...card.diagnosis.recommendedActions.map(({ action }) => action)
    ];
    for (const value of diagnosisValues) {
      const diagnosisAt = renderedHtmlIndexOf(html, value, contentEnd);
      if (diagnosisAt <= contentEnd || diagnosisAt >= cardEnd) {
        throw new Error("Combined V3 HTML artifact failed answer-source-diagnosis positional completeness readiness.");
      }
    }
  }
}

function geoArticleVisibleText(deliverable: GeoArticleDeliverable): string[] {
  if (deliverable.version === "geo_article_example_v1") return [
    deliverable.title,
    deliverable.introduction,
    ...deliverable.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs]),
    ...deliverable.faq.flatMap(({ question, answer }) => [question, answer]),
    ...deliverable.rationale.map(({ reason }) => reason)
  ].map(normalizeLegacyGeoArticleText);
  const explanation = deliverable.explanation.flatMap(({ heading, reason, geoFunction }) => [heading, reason, geoFunction]);
  if (deliverable.kind === "article") return [
    deliverable.article.title,
    deliverable.article.introduction.text,
    ...deliverable.article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs.map(({ text }) => text)]),
    ...deliverable.article.faq.flatMap(({ question, answer }) => [question, answer.text]),
    ...explanation
  ];
  return [
    deliverable.outline.workingTitle,
    deliverable.outline.readerQuestion,
    deliverable.outline.directAnswer,
    ...deliverable.outline.plannedSections.flatMap(({ heading, purpose }) => [heading, purpose]),
    ...deliverable.outline.evidenceToAdd,
    ...deliverable.outline.faqAngles,
    ...explanation
  ];
}

function normalizeLegacyGeoArticleText(value: string): string {
  return value.replace(/(?:来源|source)\s*([0-9]+)/giu, (_match, ordinal: string) => `[${Number(ordinal) + 1}]`);
}

function renderedHtmlIndexOf(html: string, value: string, fromIndex = 0): number {
  const indices = [value, escapeReactHtml(value)]
    .map((candidate) => html.indexOf(candidate, fromIndex))
    .filter((index) => index >= 0);
  return indices.length ? Math.min(...indices) : -1;
}

function escapeReactHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function renderCanonicalCombinedArtifactHtml(model: CombinedPrivateReportArtifactModel):string{
  const markup=renderToStaticMarkup(model.productContract==="combined_geo_report_v3"
    ? createElement(CombinedGeoReportV3Artifact,{model})
    : model.productContract==="combined_geo_report_v2"
      ? createElement(CombinedGeoReportV2Artifact,{model})
      : createElement(CombinedGeoReportArtifact,{model:model as CombinedPrivateReportArtifactModelV1}));
  return `<!doctype html><html lang="${model.locale}"><head><meta charset="utf-8"/><style>${ARTIFACT_CSS}</style></head><body>${markup}</body></html>`;
}

function sha(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function clipEvidence(value: string): string { return value.length > 300 ? value.slice(0, 297) : value; }
