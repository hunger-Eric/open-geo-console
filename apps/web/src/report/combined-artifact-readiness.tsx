import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assertCombinedGeoReportLanguage, GEO_TERMINOLOGY_POLICY, requireReadyCombinedGeoReport, requireReadyCombinedGeoReportV2, requireReadyCombinedGeoReportV3, type CombinedBusinessQuestionAnswers, type CombinedGeoReportV1, type CombinedGeoReportV2, type CombinedGeoReportV3, type CombinedReportLanguageScope, type GroundedAnswerEvidence, type GroundedBusinessQuestionAnswersV2, type OpenGeoAnswerCardV3, type OpenGeoEngineProvenanceV3, type ProviderDiscoveryV1, type RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
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
import { localizeTechnicalReportForArtifact } from "./technical-report-localization";
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
  const localizedAiReport: AiWebsiteReportV1 = {
    ...input.aiReport,
    coverage: {
      ...input.aiReport.coverage,
      samplingMethod: systemCopy.samplingMethod,
      limitations: systemCopy.limitations
    }
  };
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

async function materializeReadyArtifact<T extends CombinedGeoReportV1 | CombinedGeoReportV2 | CombinedGeoReportV3>(
  report: T,
  model: CombinedPrivateReportArtifactModel,
  html: string
): Promise<{ report: T; html: string; pdf: Buffer; htmlSha256: string; pdfSha256: string; pdfStorageKey: string; pageCount: number }> {
  const pdf = await exportCanonicalArtifactHtmlPdf(html);
  if (pdf.subarray(0, 5).toString("utf8") !== "%PDF-") throw new Error("Combined PDF artifact has an invalid signature.");
  const pageCount = Math.max(0, pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0);
  if (pageCount < 5) throw new Error(`Combined PDF artifact is not substantive (${pageCount} pages).`);
  const pdfStorageKey = evidenceStorageKey(model.reportId, model.artifactRevisionId, "pdf");
  const storage = createEvidenceStorage();
  await storage.put(pdfStorageKey, pdf, "application/pdf");
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
  const localizedAiReport: AiWebsiteReportV1 = {
    ...input.aiReport,
    coverage: { ...input.aiReport.coverage, samplingMethod: systemCopy.samplingMethod, limitations: systemCopy.limitations }
  };
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

export async function buildReadyCombinedArtifactV3(input: {
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
  engineProvenance: OpenGeoEngineProvenanceV3;
  publicSourceForensics: RecommendationForensicReportV2;
  providerDiscovery: ProviderDiscoveryV1;
  languageValidationScope?: CombinedReportLanguageScope;
  onReportPrepared?: (report: CombinedGeoReportV3) => void | Promise<void>;
}): Promise<ReadyCombinedArtifactV3> {
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
  const localizedAiReport: AiWebsiteReportV1 = {
    ...input.aiReport,
    coverage: { ...input.aiReport.coverage, samplingMethod: systemCopy.samplingMethod, limitations: systemCopy.limitations }
  };
  const localizedTechnicalReport = localizeTechnicalReportForArtifact(input.technicalReport, forensic.locale);
  const report = requireReadyCombinedGeoReportV3({
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
    engineProvenance: input.engineProvenance,
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
  assertCombinedGeoReportLanguage({ ...report, version: 1, artifactContract: "combined_geo_report_v1", businessQuestionAnswers: undefined }, input.languageValidationScope);
  await input.onReportPrepared?.(report);
  return materializePreparedCombinedArtifactV3(report, input.evidenceAssets);
}

export async function materializePreparedCombinedArtifactV3(
  value: unknown,
  evidenceAssets: ReportEvidenceAssetRow[]
): Promise<ReadyCombinedArtifactV3> {
  await assertReadyEvidenceAssets(evidenceAssets);
  const report = requireReadyCombinedGeoReportV3(value);
  const locale: "en" | "zh" = report.locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const model: CombinedPrivateReportArtifactModelV3 = {
    productContract: "combined_geo_report_v3", reportId: report.reportId, locale, combinedReport: report,
    technicalReport: report.technicalFoundation.technicalReport, evidenceAssets,
    artifactRevisionId: report.artifactRevisionId, pdfStorageKey: "pending"
  };
  const html = renderCanonicalCombinedArtifactHtml(model);
  assertCombinedV3HtmlCompleteness(report, html);
  return materializeReadyArtifact(report, model, html);
}

export function assertCombinedV3HtmlCompleteness(report: CombinedGeoReportV3, html: string): void {
  const required = [
    report.artifactRevisionId,
    ...report.answerCards.flatMap((card) => [
      card.exactQuestion,
      ...card.sentences.map(({ text }) => text),
      ...card.sourceEvidence.flatMap((evidence) => [evidence.title, evidence.registrableDomain, evidence.canonicalUrl, evidence.exactExcerpt, evidence.ownershipCategory, evidence.observedAt]),
      ...card.geoDiagnosis.targetRoles,
      ...card.geoDiagnosis.competitorEntityIds,
      ...card.geoDiagnosis.missingEvidenceFamilies,
      card.geoDiagnosis.retestQuestion
    ]),
    ...report.technicalFoundation.technicalReport.findings.flatMap(({ title, description, recommendation }) => [title, description, recommendation]),
    ...report.technicalFoundation.technicalReport.pages.flatMap(({ url, title, canonical, metaDescription, h1 }) => [url, title ?? "", canonical ?? "", metaDescription ?? "", ...h1]),
    ...report.technicalFoundation.aiReport.findings.flatMap(({ title, impact, recommendation }) => [title, impact, recommendation])
  ].filter(Boolean);
  if (required.some((value) => !html.includes(String(value)))) throw new Error("Combined V3 HTML artifact failed completeness readiness.");
  for (const card of report.answerCards) {
    for (const sentence of card.sentences.filter(({ kind }) => kind === "grounded_claim")) {
      const sentenceAt = html.indexOf(sentence.text);
      const nextSentenceAt = report.answerCards.flatMap(({ sentences }) => sentences).map(({ text }) => html.indexOf(text)).filter((index) => index > sentenceAt).sort((a, b) => a - b)[0] ?? html.length;
      for (const evidenceId of sentence.evidenceIds) {
        const evidence = card.sourceEvidence.find((candidate) => candidate.evidenceId === evidenceId);
        if (!evidence || html.indexOf(evidence.exactExcerpt, sentenceAt) >= nextSentenceAt) throw new Error("Combined V3 HTML artifact failed adjacent citation completeness readiness.");
      }
    }
  }
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
