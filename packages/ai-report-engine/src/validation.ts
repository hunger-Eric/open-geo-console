import {
  AI_WEBSITE_REPORT_VERSION,
  type AiWebsiteReportV1,
  type Confidence,
  type DimensionKey,
  type FindingSeverity,
  type PageType,
  type ReportTier
} from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ReportValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(`AI report validation failed with ${issues.length} issue(s).`);
    this.name = "ReportValidationError";
    this.issues = issues;
  }
}

const reportTiers: ReportTier[] = ["free", "deep"];
const confidences: Confidence[] = ["low", "medium", "high"];
const severities: FindingSeverity[] = ["critical", "warning", "opportunity"];
const pageTypes: PageType[] = [
  "home",
  "product",
  "service",
  "about",
  "pricing",
  "case-study",
  "contact",
  "blog",
  "news",
  "documentation",
  "legal",
  "other"
];
const dimensionKeys: DimensionKey[] = [
  "organizationClarity",
  "informationArchitecture",
  "contentCitability",
  "trustEvidence",
  "entityConsistency",
  "geoUnderstandability"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string, issues: ValidationIssue[]): Record<string, unknown> {
  if (isRecord(value)) return value;
  issues.push({ path, message: "Expected an object." });
  return {};
}

function requireString(value: unknown, path: string, issues: ValidationIssue[], allowEmpty = false): void {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
    issues.push({ path, message: "Expected a non-empty string." });
  }
}

function requireNullableString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value !== null) requireString(value, path, issues);
}

function requireStringArray(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Expected an array." });
    return;
  }
  value.forEach((item, index) => requireString(item, `${path}[${index}]`, issues));
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[]
): void {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issues.push({ path, message: `Expected one of: ${allowed.join(", ")}.` });
  }
}

function requireCount(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    issues.push({ path, message: "Expected a non-negative integer." });
  }
}

function requireScore(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    issues.push({ path, message: "Expected a score from 0 to 100." });
  }
}

function validateEvidence(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Expected an evidence array." });
    return;
  }
  value.forEach((item, index) => {
    const evidence = requireRecord(item, `${path}[${index}]`, issues);
    requireString(evidence.url, `${path}[${index}].url`, issues);
    requireString(evidence.quote, `${path}[${index}].quote`, issues);
    if (evidence.pageElement !== undefined) {
      requireString(evidence.pageElement, `${path}[${index}].pageElement`, issues);
    }
  });
}

function validateRoadmapItems(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Expected an array." });
    return;
  }
  value.forEach((item, index) => {
    const record = requireRecord(item, `${path}[${index}]`, issues);
    requireString(record.title, `${path}[${index}].title`, issues);
    requireString(record.rationale, `${path}[${index}].rationale`, issues);
    requireStringArray(record.actions, `${path}[${index}].actions`, issues);
    requireStringArray(record.relatedFindingIds, `${path}[${index}].relatedFindingIds`, issues);
  });
}

export function validateAiWebsiteReportV1(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = requireRecord(value, "$", issues);

  if (report.version !== AI_WEBSITE_REPORT_VERSION) {
    issues.push({ path: "$.version", message: `Expected version ${AI_WEBSITE_REPORT_VERSION}.` });
  }
  requireEnum(report.tier, reportTiers, "$.tier", issues);
  requireString(report.targetUrl, "$.targetUrl", issues);

  const profile = requireRecord(report.organizationProfile, "$.organizationProfile", issues);
  requireNullableString(profile.organizationName, "$.organizationProfile.organizationName", issues);
  requireStringArray(profile.brandNames, "$.organizationProfile.brandNames", issues);
  requireString(profile.summary, "$.organizationProfile.summary", issues);
  requireNullableString(profile.businessModel, "$.organizationProfile.businessModel", issues);
  requireStringArray(profile.productsAndServices, "$.organizationProfile.productsAndServices", issues);
  requireStringArray(profile.targetAudiences, "$.organizationProfile.targetAudiences", issues);
  requireStringArray(profile.marketsAndRegions, "$.organizationProfile.marketsAndRegions", issues);
  requireNullableString(profile.legalEntity, "$.organizationProfile.legalEntity", issues);
  requireString(profile.identityConsistency, "$.organizationProfile.identityConsistency", issues);
  if (profile.ownershipVerification !== "not-performed") {
    issues.push({
      path: "$.organizationProfile.ownershipVerification",
      message: "External ownership verification must be marked not-performed."
    });
  }
  requireEnum(profile.confidence, confidences, "$.organizationProfile.confidence", issues);
  validateEvidence(profile.evidence, "$.organizationProfile.evidence", issues);

  const executive = requireRecord(report.executiveSummary, "$.executiveSummary", issues);
  requireString(executive.overview, "$.executiveSummary.overview", issues);
  requireStringArray(executive.strengths, "$.executiveSummary.strengths", issues);
  requireStringArray(executive.keyRisks, "$.executiveSummary.keyRisks", issues);
  requireStringArray(executive.topPriorities, "$.executiveSummary.topPriorities", issues);

  if (!Array.isArray(report.dimensionScores)) {
    issues.push({ path: "$.dimensionScores", message: "Expected an array." });
  } else {
    report.dimensionScores.forEach((item, index) => {
      const dimension = requireRecord(item, `$.dimensionScores[${index}]`, issues);
      requireEnum(dimension.dimension, dimensionKeys, `$.dimensionScores[${index}].dimension`, issues);
      requireScore(dimension.score, `$.dimensionScores[${index}].score`, issues);
      requireString(dimension.explanation, `$.dimensionScores[${index}].explanation`, issues);
      requireEnum(dimension.confidence, confidences, `$.dimensionScores[${index}].confidence`, issues);
      validateEvidence(dimension.evidence, `$.dimensionScores[${index}].evidence`, issues);
    });
    const present = new Set(
      report.dimensionScores
        .filter(isRecord)
        .map((item) => item.dimension)
        .filter((item): item is string => typeof item === "string")
    );
    for (const key of dimensionKeys) {
      if (!present.has(key)) {
        issues.push({ path: "$.dimensionScores", message: `Missing dimension ${key}.` });
      }
    }
    if (report.dimensionScores.length !== dimensionKeys.length || present.size !== dimensionKeys.length) {
      issues.push({
        path: "$.dimensionScores",
        message: "Expected each report dimension exactly once."
      });
    }
  }

  if (!Array.isArray(report.pageTypeAnalyses)) {
    issues.push({ path: "$.pageTypeAnalyses", message: "Expected an array." });
  } else {
    report.pageTypeAnalyses.forEach((item, index) => {
      const analysis = requireRecord(item, `$.pageTypeAnalyses[${index}]`, issues);
      requireEnum(analysis.pageType, pageTypes, `$.pageTypeAnalyses[${index}].pageType`, issues);
      requireStringArray(analysis.sampledUrls, `$.pageTypeAnalyses[${index}].sampledUrls`, issues);
      requireStringArray(analysis.strengths, `$.pageTypeAnalyses[${index}].strengths`, issues);
      requireStringArray(analysis.commonIssues, `$.pageTypeAnalyses[${index}].commonIssues`, issues);
      requireStringArray(analysis.recommendations, `$.pageTypeAnalyses[${index}].recommendations`, issues);
      validateEvidence(analysis.evidence, `$.pageTypeAnalyses[${index}].evidence`, issues);
    });
  }

  if (!Array.isArray(report.findings)) {
    issues.push({ path: "$.findings", message: "Expected an array." });
  } else {
    report.findings.forEach((item, index) => {
      const finding = requireRecord(item, `$.findings[${index}]`, issues);
      requireString(finding.id, `$.findings[${index}].id`, issues);
      requireString(finding.title, `$.findings[${index}].title`, issues);
      requireEnum(finding.severity, severities, `$.findings[${index}].severity`, issues);
      requireString(finding.impact, `$.findings[${index}].impact`, issues);
      validateEvidence(finding.evidence, `$.findings[${index}].evidence`, issues);
      requireString(finding.recommendation, `$.findings[${index}].recommendation`, issues);
      if (finding.rewriteExample !== undefined) {
        requireString(finding.rewriteExample, `$.findings[${index}].rewriteExample`, issues);
      }
      requireEnum(finding.confidence, confidences, `$.findings[${index}].confidence`, issues);
    });
    const findingIds = report.findings
      .filter(isRecord)
      .map((finding) => finding.id)
      .filter((id): id is string => typeof id === "string");
    if (new Set(findingIds).size !== findingIds.length) {
      issues.push({ path: "$.findings", message: "Finding IDs must be unique." });
    }
  }

  const roadmap = requireRecord(report.roadmap, "$.roadmap", issues);
  validateRoadmapItems(roadmap.immediate, "$.roadmap.immediate", issues);
  validateRoadmapItems(roadmap.nextPhase, "$.roadmap.nextPhase", issues);
  validateRoadmapItems(roadmap.ongoing, "$.roadmap.ongoing", issues);

  const coverage = requireRecord(report.coverage, "$.coverage", issues);
  requireCount(coverage.discoveredPages, "$.coverage.discoveredPages", issues);
  requireCount(coverage.plannedPages, "$.coverage.plannedPages", issues);
  requireCount(coverage.analyzedPages, "$.coverage.analyzedPages", issues);
  requireCount(coverage.failedPages, "$.coverage.failedPages", issues);
  requireString(coverage.samplingMethod, "$.coverage.samplingMethod", issues);
  if (!Array.isArray(coverage.pageTypesCovered)) {
    issues.push({ path: "$.coverage.pageTypesCovered", message: "Expected an array." });
  } else {
    coverage.pageTypesCovered.forEach((item, index) =>
      requireEnum(item, pageTypes, `$.coverage.pageTypesCovered[${index}]`, issues)
    );
  }
  requireStringArray(coverage.limitations, "$.coverage.limitations", issues);

  const provenance = requireRecord(report.provenance, "$.provenance", issues);
  if (provenance.reportVersion !== AI_WEBSITE_REPORT_VERSION) {
    issues.push({ path: "$.provenance.reportVersion", message: "Expected report version 1." });
  }
  requireString(provenance.modelId, "$.provenance.modelId", issues);
  requireString(provenance.promptVersion, "$.provenance.promptVersion", issues);
  requireString(provenance.locale, "$.provenance.locale", issues);
  requireString(provenance.generatedAt, "$.provenance.generatedAt", issues);
  requireString(provenance.contentHash, "$.provenance.contentHash", issues);

  return issues;
}

export function parseAiWebsiteReportV1(value: unknown): AiWebsiteReportV1 {
  const issues = validateAiWebsiteReportV1(value);
  if (issues.length > 0) throw new ReportValidationError(issues);
  return value as AiWebsiteReportV1;
}

export const AI_REPORT_DIMENSIONS = dimensionKeys;
export const AI_REPORT_PAGE_TYPES = pageTypes;
