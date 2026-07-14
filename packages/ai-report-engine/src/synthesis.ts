import type { JsonCompletionClient } from "./client";
import { sha256Hex, verifyReportEvidence, type RejectedEvidence } from "./evidence";
import {
  AI_REPORT_PROMPT_VERSION,
  AI_WEBSITE_REPORT_VERSION,
  type AiFinding,
  type AiWebsiteReportV1,
  type ReportSynthesisInput
} from "./types";
import { parseAiWebsiteReportV1 } from "./validation";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
  reportLanguageInstruction
} from "./report-language";

export interface SynthesizeReportResult {
  report: AiWebsiteReportV1;
  modelId: string;
  rejectedFindingIds: string[];
  rejectedEvidence: RejectedEvidence[];
}

const severityRank: Record<AiFinding["severity"], number> = {
  critical: 3,
  warning: 2,
  opportunity: 1
};

function compactPageEvidence(input: ReportSynthesisInput): Array<Record<string, unknown>> {
  return input.pages.map((page) => ({
    url: page.url,
    pageType: page.pageType,
    title: page.title,
    description: page.description,
    excerpt: page.text.slice(0, 4_000)
  }));
}

export function buildSynthesisPrompt(input: ReportSynthesisInput, correctionRequired: readonly string[] = []): string {
  const languageInstruction = reportLanguageInstruction(input.locale);
  return JSON.stringify({
    task: "Create a commercial-grade, evidence-grounded AI website analysis report.",
    rules: [
      languageInstruction,
      "Use only supplied evidence and analyses.",
      "Every finding must cite an exact supplied URL and a verbatim quote.",
      "Do not claim external domain ownership verification; ownershipVerification must be not-performed.",
      "Scores are semantic AI assessments and must not alter any separate deterministic technical GEO score.",
      "Clearly state uncertainty and sampling limitations."
    ],
    ...(correctionRequired.length ? { correctionRequired } : {}),
    targetUrl: input.targetUrl,
    tier: input.tier,
    locale: input.locale,
    organizationHints: input.organizationHints ?? [],
    coverage: input.coverage,
    requiredDimensions: [
      "organizationClarity",
      "informationArchitecture",
      "contentCitability",
      "trustEvidence",
      "entityConsistency",
      "geoUnderstandability"
    ],
    requiredShape: {
      organizationProfile: {
        organizationName: "string|null",
        brandNames: ["string"],
        summary: "string",
        businessModel: "string|null",
        productsAndServices: ["string"],
        capabilities: ["string"],
        targetAudiences: ["string"],
        marketsAndRegions: ["string"],
        legalEntity: "string|null",
        identityConsistency: "string",
        ownershipVerification: "not-performed",
        confidence: "low|medium|high",
        evidence: [{ url: "string", quote: "verbatim string", pageElement: "optional string" }]
      },
      executiveSummary: {
        overview: "string",
        strengths: ["string"],
        keyRisks: ["string"],
        topPriorities: ["string"]
      },
      dimensionScores: [{
        dimension: "one required dimension",
        score: "0-100 number",
        explanation: "string",
        confidence: "low|medium|high",
        evidence: [{ url: "string", quote: "verbatim string" }]
      }],
      pageTypeAnalyses: [{
        pageType: "supplied page type",
        sampledUrls: ["string"],
        strengths: ["string"],
        commonIssues: ["string"],
        recommendations: ["string"],
        evidence: [{ url: "string", quote: "verbatim string" }]
      }],
      findings: [{
        id: "stable kebab-case id",
        title: "string",
        severity: "critical|warning|opportunity",
        impact: "string",
        evidence: [{ url: "string", quote: "verbatim string", pageElement: "optional string" }],
        pageElement: "optional string",
        recommendation: "string",
        rewriteExample: "optional string",
        confidence: "low|medium|high"
      }],
      roadmap: {
        immediate: [{ title: "string", rationale: "string", actions: ["string"], relatedFindingIds: ["string"] }],
        nextPhase: [{ title: "string", rationale: "string", actions: ["string"], relatedFindingIds: ["string"] }],
        ongoing: [{ title: "string", rationale: "string", actions: ["string"], relatedFindingIds: ["string"] }]
      }
    },
    pageEvidence: compactPageEvidence(input),
    pageAnalyses: input.pageAnalyses
  });
}

export async function synthesizeWebsiteReport(
  client: JsonCompletionClient,
  input: ReportSynthesisInput,
  signal?: AbortSignal,
  correctionRequired: readonly string[] = []
): Promise<SynthesizeReportResult> {
  const languageInstruction = reportLanguageInstruction(input.locale);
  const completion = await client.completeJson({
    signal,
    temperature: 0.1,
    maxTokens: 12_000,
    messages: [
      {
        role: "system",
        content:
          `You are a senior GEO and website intelligence analyst. Produce a decision-useful JSON report grounded exclusively in supplied website evidence. JSON only. ${languageInstruction}`
      },
      { role: "user", content: buildSynthesisPrompt(input, correctionRequired) }
    ]
  });

  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const contentHash = await sha256Hex(
    JSON.stringify(input.pages.map((page) => ({ url: page.url, text: page.text })))
  );
  const modelOutput = completion.value && typeof completion.value === "object"
    ? normalizeModelOutput(completion.value as Record<string, unknown>)
    : {};
  const profile = modelOutput.organizationProfile && typeof modelOutput.organizationProfile === "object"
    ? modelOutput.organizationProfile as Record<string, unknown>
    : {};

  const report = parseAiWebsiteReportV1({
    ...modelOutput,
    version: AI_WEBSITE_REPORT_VERSION,
    tier: input.tier,
    targetUrl: input.targetUrl,
    organizationProfile: {
      ...profile,
      ownershipVerification: "not-performed"
    },
    coverage: input.coverage,
    provenance: {
      reportVersion: AI_WEBSITE_REPORT_VERSION,
      modelId: completion.modelId,
      promptVersion: AI_REPORT_PROMPT_VERSION,
      locale: input.locale,
      generatedAt,
      contentHash
    }
  });

  const verified = verifyReportEvidence(report, input.pages);
  const tierFindings = input.tier === "free"
    ? [...verified.report.findings]
        .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
        .slice(0, 1)
    : verified.report.findings;
  const finalReport = { ...verified.report, findings: tierFindings };
  assertWebsiteReportLanguage(finalReport, input);

  return {
    report: finalReport,
    modelId: completion.modelId,
    rejectedFindingIds: verified.rejectedFindingIds,
    rejectedEvidence: verified.rejectedEvidence
  };
}

export async function synthesizeWebsiteReportWithRecovery(
  client: JsonCompletionClient,
  input: ReportSynthesisInput,
  options: { maxAttempts?: number; delay?: (milliseconds: number) => Promise<void>; signal?: AbortSignal } = {}
): Promise<SynthesizeReportResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const delay = options.delay ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  let languageCorrectionUsed = false;
  let languageFeedback: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.signal?.throwIfAborted();
    const isLanguageCorrectionCall = languageFeedback.length > 0;
    try {
      return await synthesizeWebsiteReport(client, input, options.signal, languageFeedback);
    } catch (error) {
      lastError = error;
      if (isLanguageCorrectionCall) throw error;
      if (error instanceof ReportLanguageValidationError) {
        if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
        languageCorrectionUsed = true;
        languageFeedback = languageViolationFeedback(error);
      }
      if (attempt < maxAttempts) await delayWithSignal(delay, Math.min(2_000, 250 * (2 ** (attempt - 1))), options.signal);
    }
  }
  throw lastError;
}

function assertWebsiteReportLanguage(report: AiWebsiteReportV1, input: ReportSynthesisInput): void {
  const roadmap = [...report.roadmap.immediate, ...report.roadmap.nextPhase, ...report.roadmap.ongoing];
  assertReportLanguage([
    { path: "organizationProfile.summary", text: report.organizationProfile.summary },
    ...(report.organizationProfile.businessModel
      ? [{ path: "organizationProfile.businessModel", text: report.organizationProfile.businessModel }]
      : []),
    ...report.organizationProfile.productsAndServices.map((text, index) => ({ path: `organizationProfile.productsAndServices[${index}]`, text })),
    ...(report.organizationProfile.capabilities ?? []).map((text, index) => ({ path: `organizationProfile.capabilities[${index}]`, text })),
    ...report.organizationProfile.targetAudiences.map((text, index) => ({ path: `organizationProfile.targetAudiences[${index}]`, text })),
    ...report.organizationProfile.marketsAndRegions.map((text, index) => ({ path: `organizationProfile.marketsAndRegions[${index}]`, text })),
    { path: "organizationProfile.identityConsistency", text: report.organizationProfile.identityConsistency },
    { path: "executiveSummary.overview", text: report.executiveSummary.overview },
    ...report.executiveSummary.strengths.map((text, index) => ({ path: `executiveSummary.strengths[${index}]`, text })),
    ...report.executiveSummary.keyRisks.map((text, index) => ({ path: `executiveSummary.keyRisks[${index}]`, text })),
    ...report.executiveSummary.topPriorities.map((text, index) => ({ path: `executiveSummary.topPriorities[${index}]`, text })),
    ...report.dimensionScores.map((item, index) => ({ path: `dimensionScores[${index}].explanation`, text: item.explanation })),
    ...report.pageTypeAnalyses.flatMap((item, itemIndex) => [
      ...item.strengths.map((text, index) => ({ path: `pageTypeAnalyses[${itemIndex}].strengths[${index}]`, text })),
      ...item.commonIssues.map((text, index) => ({ path: `pageTypeAnalyses[${itemIndex}].commonIssues[${index}]`, text })),
      ...item.recommendations.map((text, index) => ({ path: `pageTypeAnalyses[${itemIndex}].recommendations[${index}]`, text }))
    ]),
    ...report.findings.flatMap((item, itemIndex) => [
      { path: `findings[${itemIndex}].title`, text: item.title },
      { path: `findings[${itemIndex}].impact`, text: item.impact },
      { path: `findings[${itemIndex}].recommendation`, text: item.recommendation },
      ...(item.rewriteExample ? [{ path: `findings[${itemIndex}].rewriteExample`, text: item.rewriteExample }] : [])
    ]),
    ...roadmap.flatMap((item, itemIndex) => [
      { path: `roadmap[${itemIndex}].title`, text: item.title },
      { path: `roadmap[${itemIndex}].rationale`, text: item.rationale },
      ...item.actions.map((text, index) => ({ path: `roadmap[${itemIndex}].actions[${index}]`, text }))
    ])
  ], input.locale, collectSourceGroundedAllowedTerms(report, input));
}

function collectSourceGroundedAllowedTerms(report: AiWebsiteReportV1, input: ReportSynthesisInput): string[] {
  const profile = report.organizationProfile;
  const authoritativeNames = [
    profile.organizationName,
    ...profile.brandNames,
    profile.legalEntity
  ].filter((value): value is string => Boolean(value?.trim()) && value!.length <= 120);
  const distinctiveProducts = profile.productsAndServices
    .filter((value) => value.length <= 120 && isDistinctiveProperName(value));
  const exactHints = new Set((input.organizationHints ?? []).map((value) => value.trim()).filter(Boolean));
  const suppliedPageValues = input.pages.flatMap((page) => [
    page.title ?? "",
    page.description ?? "",
    page.text,
    ...Object.values(page.metadata ?? {}).flatMap((value) => Array.isArray(value) ? value : [value])
  ]);
  return [...new Set([...authoritativeNames, ...distinctiveProducts]
    .filter((term) => exactHints.has(term) || suppliedPageValues.some((value) => value.includes(term))))];
}

function isDistinctiveProperName(value: string): boolean {
  const term = value.trim();
  if (/^[\u3400-\u9fff]{2,12}$/u.test(term)) return true;
  return term.split(/\s+/).some((token) =>
    /\d/.test(token) ||
    /[a-z][A-Z]/.test(token) ||
    /^[A-Z]{2,}$/.test(token) ||
    /[-&+._]/.test(token));
}

function languageViolationFeedback(error: ReportLanguageValidationError): string[] {
  return error.violations.map(({ path, reason }) => `${path}: ${reason}`);
}

async function delayWithSignal(delay: (milliseconds: number) => Promise<void>, milliseconds: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (!signal) return delay(milliseconds);
  await Promise.race([
    delay(milliseconds),
    new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
  ]);
}

function normalizeModelOutput(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = stripNullOptionalStrings(value) as Record<string, unknown>;
  if (!Array.isArray(normalized.findings)) return normalized;

  const usedIds = new Set<string>();
  normalized.findings = normalized.findings.map((finding, index) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return finding;
    const record = { ...(finding as Record<string, unknown>) };
    const baseId = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `finding-${index + 1}`;
    let uniqueId = baseId;
    let suffix = 2;
    while (usedIds.has(uniqueId)) uniqueId = `${baseId}-${suffix++}`;
    usedIds.add(uniqueId);
    record.id = uniqueId;
    return record;
  });
  return normalized;
}

function stripNullOptionalStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullOptionalStrings);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, child]) =>
        !((key === "pageElement" || key === "rewriteExample") &&
          (child === null || child === ""))
      )
      .map(([key, child]) => [key, stripNullOptionalStrings(child)])
  );
}
