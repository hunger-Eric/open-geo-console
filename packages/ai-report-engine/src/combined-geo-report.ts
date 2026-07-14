import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { parseRecommendationForensicReportV2, type RecommendationForensicReportV2, type V2VendorTask } from "./recommendation-forensic-v2";
import { parseAiWebsiteReportV1 } from "./validation";
import type { AiWebsiteReportV1 } from "./types";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { parseCombinedBusinessQuestionAnswers, type CombinedBusinessQuestionAnswers } from "./combined-business-question-answers";
import { assertReportLanguage, type ReportLanguageField } from "./report-language";

export const COMBINED_GEO_REPORT_VERSION = 1 as const;
export const COMBINED_GEO_REPORT_CONTRACT = "combined_geo_report_v1" as const;

export interface CombinedEvidenceAssetReference {
  assetId: string;
  jobId: string;
  sourceUrl: string;
  kind: "issue_crop" | "context" | "compact" | "viewport";
  contentHash: string;
}

export interface CombinedGeoReportV1 {
  version: typeof COMBINED_GEO_REPORT_VERSION;
  artifactContract: typeof COMBINED_GEO_REPORT_CONTRACT;
  productCode: "recommendation_forensics_v1";
  artifactRevisionId: string;
  artifactRevision: number;
  reportId: string;
  orderId: string;
  jobId: string;
  originalPaidJobId: string;
  targetUrl: string;
  locale: string;
  region: string;
  generatedAt: string;
  evidenceCutoffAt: string;
  technicalInputIdentity: string;
  questionSetIdentity: string;
  technicalFoundation: {
    technicalReport: GeoAuditReport;
    aiReport: AiWebsiteReportV1;
    evidenceAssets: CombinedEvidenceAssetReference[];
  };
  businessQuestionSet: ConfirmedBusinessQuestionSet;
  publicSourceForensics: RecommendationForensicReportV2;
  businessQuestionAnswers?: CombinedBusinessQuestionAnswers;
  vendorTaskPackage: { version: "combined-vendor-task-v1"; tasks: V2VendorTask[] };
  methodology: {
    htmlCanonical: true;
    publicSearchSurface: string;
    technicalCoverage: string;
    evidenceFreshness: string;
    limitations: string[];
    nonCausal: true;
  };
}

/**
 * Prospective publication gate for newly materialized combined reports.
 * Parsing historical artifacts deliberately does not invoke this validation.
 */
export function assertCombinedGeoReportLanguage(report: CombinedGeoReportV1): void {
  const fields: ReportLanguageField[] = [];
  const add = (path: string, value: string | null | undefined) => {
    if (value?.trim()) fields.push({ path, text: value });
  };
  const addList = (path: string, values: readonly string[] | undefined) =>
    values?.forEach((value, index) => add(`${path}[${index}]`, value));

  const ai = report.technicalFoundation.aiReport;
  add("technicalFoundation.aiReport.organizationProfile.summary", ai.organizationProfile.summary);
  add("technicalFoundation.aiReport.organizationProfile.identityConsistency", ai.organizationProfile.identityConsistency);
  add("technicalFoundation.aiReport.executiveSummary.overview", ai.executiveSummary.overview);
  addList("technicalFoundation.aiReport.executiveSummary.strengths", ai.executiveSummary.strengths);
  addList("technicalFoundation.aiReport.executiveSummary.keyRisks", ai.executiveSummary.keyRisks);
  addList("technicalFoundation.aiReport.executiveSummary.topPriorities", ai.executiveSummary.topPriorities);
  ai.dimensionScores.forEach((score, index) => add(`technicalFoundation.aiReport.dimensionScores[${index}].explanation`, score.explanation));
  ai.pageTypeAnalyses.forEach((analysis, index) => {
    addList(`technicalFoundation.aiReport.pageTypeAnalyses[${index}].strengths`, analysis.strengths);
    addList(`technicalFoundation.aiReport.pageTypeAnalyses[${index}].commonIssues`, analysis.commonIssues);
    addList(`technicalFoundation.aiReport.pageTypeAnalyses[${index}].recommendations`, analysis.recommendations);
  });
  ai.findings.forEach((finding, index) => {
    add(`technicalFoundation.aiReport.findings[${index}].title`, finding.title);
    add(`technicalFoundation.aiReport.findings[${index}].impact`, finding.impact);
    add(`technicalFoundation.aiReport.findings[${index}].recommendation`, finding.recommendation);
    add(`technicalFoundation.aiReport.findings[${index}].rewriteExample`, finding.rewriteExample);
  });
  (["immediate", "nextPhase", "ongoing"] as const).forEach((phase) => {
    ai.roadmap[phase].forEach((item, index) => {
      add(`technicalFoundation.aiReport.roadmap.${phase}[${index}].title`, item.title);
      add(`technicalFoundation.aiReport.roadmap.${phase}[${index}].rationale`, item.rationale);
      addList(`technicalFoundation.aiReport.roadmap.${phase}[${index}].actions`, item.actions);
    });
  });
  add("technicalFoundation.aiReport.coverage.samplingMethod", ai.coverage.samplingMethod);
  addList("technicalFoundation.aiReport.coverage.limitations", ai.coverage.limitations);

  report.businessQuestionSet.questions.forEach((question, index) =>
    add(`businessQuestionSet.questions[${index}].privateText`, question.privateText));
  report.businessQuestionAnswers?.answers.forEach((answer, index) =>
    add(`businessQuestionAnswers.answers[${index}].answer`, answer.answer));

  const forensic = report.publicSourceForensics;
  forensic.customerComparison.forEach((section, index) => {
    add(`publicSourceForensics.customerComparison[${index}].title`, section.title);
    add(`publicSourceForensics.customerComparison[${index}].text`, section.text);
  });
  add("publicSourceForensics.executiveVerdict.title", forensic.executiveVerdict.title);
  add("publicSourceForensics.executiveVerdict.text", forensic.executiveVerdict.text);
  forensic.executivePriorities.forEach((section, index) => {
    add(`publicSourceForensics.executivePriorities[${index}].title`, section.title);
    add(`publicSourceForensics.executivePriorities[${index}].text`, section.text);
  });
  addList("publicSourceForensics.limitations", forensic.limitations);
  report.vendorTaskPackage.tasks.forEach((task, index) => {
    add(`vendorTaskPackage.tasks[${index}].title`, task.title);
    add(`vendorTaskPackage.tasks[${index}].text`, task.text);
    addList(`vendorTaskPackage.tasks[${index}].actions`, task.actions);
    addList(`vendorTaskPackage.tasks[${index}].acceptanceCriteria`, task.acceptanceCriteria);
  });
  add("methodology.technicalCoverage", report.methodology.technicalCoverage);
  add("methodology.evidenceFreshness", report.methodology.evidenceFreshness);
  addList("methodology.limitations", report.methodology.limitations);

  const allowedTerms = [
    ai.organizationProfile.organizationName,
    ai.organizationProfile.legalEntity,
    ...ai.organizationProfile.brandNames,
    ...forensic.sourceGraph.entities.filter(({ status }) => status === "resolved").map(({ canonicalName }) => canonicalName),
    ...forensic.sourceGraph.claims.filter(({ status }) => status === "supported").map(({ subjectName }) => subjectName)
  ].filter((value): value is string => Boolean(value?.trim()) && value.length <= 120);
  assertReportLanguage(fields, report.locale, [...new Set(allowedTerms)]);
}

export function parseCombinedGeoReportV1(value: unknown): CombinedGeoReportV1 {
  const report = object(value, "$combined");
  exact(report.version, COMBINED_GEO_REPORT_VERSION, "version");
  exact(report.artifactContract, COMBINED_GEO_REPORT_CONTRACT, "artifactContract");
  exact(report.productCode, "recommendation_forensics_v1", "productCode");
  const artifactRevisionId = text(report.artifactRevisionId, "artifactRevisionId");
  const artifactRevision = positive(report.artifactRevision, "artifactRevision");
  const reportId = text(report.reportId, "reportId");
  const orderId = text(report.orderId, "orderId");
  const jobId = text(report.jobId, "jobId");
  text(report.originalPaidJobId, "originalPaidJobId");
  const targetUrl = httpUrl(report.targetUrl, "targetUrl");
  const locale = text(report.locale, "locale");
  const region = text(report.region, "region");
  timestamp(report.generatedAt, "generatedAt");
  const evidenceCutoffAt = timestamp(report.evidenceCutoffAt, "evidenceCutoffAt");
  text(report.technicalInputIdentity, "technicalInputIdentity");
  const questionSetIdentity = text(report.questionSetIdentity, "questionSetIdentity");
  const technical = object(report.technicalFoundation, "technicalFoundation");
  const technicalReport = parseTechnicalReport(technical.technicalReport);
  const aiReport = parseAiWebsiteReportV1(technical.aiReport);
  if (!sameTarget(technicalReport.url, targetUrl) || !sameTarget(aiReport.targetUrl, targetUrl) || !sameLocale(aiReport.provenance.locale, locale)) {
    throw new TypeError("Combined technical foundation target/locale does not match the report.");
  }
  const evidenceAssets = array(technical.evidenceAssets, "technicalFoundation.evidenceAssets").map(parseEvidenceAsset);
  if (evidenceAssets.some((asset) => asset.jobId !== jobId && asset.jobId !== report.originalPaidJobId)) {
    throw new TypeError("Combined evidence assets must belong to the correction or original paid job.");
  }
  const businessQuestionSet = parseBusinessQuestionSet(report.businessQuestionSet);
  if (businessQuestionSet.id !== questionSetIdentity || businessQuestionSet.locale !== locale || businessQuestionSet.questions.length !== 3) {
    throw new TypeError("Combined business question identity/locale is invalid.");
  }
  const publicSourceForensics = parseRecommendationForensicReportV2(report.publicSourceForensics);
  if (publicSourceForensics.reportId !== reportId || publicSourceForensics.jobId !== jobId || !sameTarget(publicSourceForensics.targetUrl, targetUrl)
      || publicSourceForensics.evidenceCutoffAt !== evidenceCutoffAt || publicSourceForensics.locale !== locale || publicSourceForensics.region !== region) {
    throw new TypeError("Combined public-source identities do not match the report.");
  }
  const publicQuestions = publicSourceForensics.questions.questions.map(({ normalizedText }) => normalizedText);
  const neutralQuestions = businessQuestionSet.questions.map(({ neutralPublicText }) => neutralPublicText.normalize("NFKC").trim());
  if (publicQuestions.length !== 3 || publicQuestions.some((question, index) => question !== neutralQuestions[index])) {
    throw new TypeError("Public-source questions must exactly match the neutral question variants.");
  }
  const businessQuestionAnswers = report.businessQuestionAnswers === undefined
    ? undefined
    : parseCombinedBusinessQuestionAnswers(report.businessQuestionAnswers, businessQuestionSet, publicSourceForensics);
  const taskPackage = object(report.vendorTaskPackage, "vendorTaskPackage");
  exact(taskPackage.version, "combined-vendor-task-v1", "vendorTaskPackage.version");
  const tasks = array(taskPackage.tasks, "vendorTaskPackage.tasks") as unknown as V2VendorTask[];
  if (tasks.length === 0 || tasks.some((task) => !task.acceptanceCriteria?.length || !task.actions?.length)) {
    throw new TypeError("Combined vendor tasks require actions and acceptance criteria.");
  }
  const methodology = object(report.methodology, "methodology");
  exact(methodology.htmlCanonical, true, "methodology.htmlCanonical");
  exact(methodology.nonCausal, true, "methodology.nonCausal");
  text(methodology.publicSearchSurface, "methodology.publicSearchSurface");
  text(methodology.technicalCoverage, "methodology.technicalCoverage");
  text(methodology.evidenceFreshness, "methodology.evidenceFreshness");
  const limitations = array(methodology.limitations, "methodology.limitations").map((item, index) => text(item, `methodology.limitations[${index}]`));
  return {
    ...(value as CombinedGeoReportV1),
    artifactRevisionId, artifactRevision, reportId, orderId, jobId, targetUrl, locale, region, evidenceCutoffAt,
    technicalFoundation: { technicalReport, aiReport, evidenceAssets },
    businessQuestionSet,
    publicSourceForensics,
    ...(businessQuestionAnswers ? { businessQuestionAnswers } : {}),
    vendorTaskPackage: { version: "combined-vendor-task-v1", tasks },
    methodology: { htmlCanonical: true, nonCausal: true, publicSearchSurface: methodology.publicSearchSurface as string,
      technicalCoverage: methodology.technicalCoverage as string, evidenceFreshness: methodology.evidenceFreshness as string, limitations }
  };
}

export function requireReadyCombinedGeoReport(value: unknown): CombinedGeoReportV1 & { businessQuestionAnswers: CombinedBusinessQuestionAnswers } {
  const report = parseCombinedGeoReportV1(value);
  if (!report.businessQuestionAnswers) throw new TypeError("Ready combined report requires three grounded business-question answers.");
  return report as CombinedGeoReportV1 & { businessQuestionAnswers: CombinedBusinessQuestionAnswers };
}

function parseTechnicalReport(value: unknown): GeoAuditReport {
  const report = object(value, "technicalReport") as unknown as GeoAuditReport;
  httpUrl(report.url, "technicalReport.url");
  if (!Number.isFinite(report.score) || !Array.isArray(report.findings) || !Array.isArray(report.pages)) {
    throw new TypeError("Technical report is incomplete.");
  }
  return report;
}

function parseBusinessQuestionSet(value: unknown): ConfirmedBusinessQuestionSet {
  const set = object(value, "businessQuestionSet") as unknown as ConfirmedBusinessQuestionSet;
  text(set.id, "businessQuestionSet.id");
  if (!Number.isSafeInteger(set.revision) || set.revision < 1 || !set.confirmedAt || !set.contentHash || !Array.isArray(set.questions) || set.questions.length !== 3) {
    throw new TypeError("Confirmed business question set is invalid.");
  }
  const purposes = set.questions.map(({ purpose }) => purpose);
  if (purposes.join("|") !== "core_service_discovery|customer_region_fit|purchase_delivery_risk") {
    throw new TypeError("Confirmed business question purposes are invalid.");
  }
  return set;
}

function parseEvidenceAsset(value: unknown): CombinedEvidenceAssetReference {
  const asset = object(value, "evidenceAsset");
  const kind = text(asset.kind, "evidenceAsset.kind") as CombinedEvidenceAssetReference["kind"];
  if (!["issue_crop", "context", "compact", "viewport"].includes(kind)) throw new TypeError("Evidence asset kind is invalid.");
  return { assetId: text(asset.assetId, "evidenceAsset.assetId"), jobId: text(asset.jobId, "evidenceAsset.jobId"),
    sourceUrl: httpUrl(asset.sourceUrl, "evidenceAsset.sourceUrl"), kind, contentHash: text(asset.contentHash, "evidenceAsset.contentHash") };
}

function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`); return value; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be non-empty text.`); return value; }
function positive(value: unknown, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < 1) throw new TypeError(`${label} must be a positive integer.`); return value as number; }
function timestamp(value: unknown, label: string): string { const result = text(value, label); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${label} must be an ISO timestamp.`); return result; }
function httpUrl(value: unknown, label: string): string { const result = text(value, label); const url = new URL(result); if (!/^https?:$/.test(url.protocol)) throw new TypeError(`${label} must be HTTP(S).`); return url.href; }
function exact(value: unknown, expected: unknown, label: string): void { if (value !== expected) throw new TypeError(`${label} must equal ${String(expected)}.`); }
function sameLocale(left: string, right: string): boolean { return left.toLowerCase().split(/[-_]/, 1)[0] === right.toLowerCase().split(/[-_]/, 1)[0]; }
function sameTarget(left: string, right: string): boolean {
  try {
    const a = new URL(left); const b = new URL(right);
    a.hash = ""; b.hash = "";
    a.pathname = a.pathname.replace(/\/$/, "") || "/";
    b.pathname = b.pathname.replace(/\/$/, "") || "/";
    return a.href === b.href;
  } catch { return false; }
}
