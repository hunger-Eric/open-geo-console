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
  GEO_TERMINOLOGY_POLICY,
  ReportLanguageValidationError,
  assertGeoTerminology,
  assertReportLanguage,
  normalizeReportCorrectionText,
  reportLanguageCorrectionFeedback,
  reportLanguageInstruction
} from "./report-language";

export interface SynthesizeReportResult {
  report: AiWebsiteReportV1;
  modelId: string;
  rejectedFindingIds: string[];
  rejectedEvidence: RejectedEvidence[];
}

class WebsiteReportLanguageValidationError extends ReportLanguageValidationError {
  readonly draft: SynthesizeReportResult;

  constructor(error: ReportLanguageValidationError, draft: SynthesizeReportResult) {
    super(error.violations);
    this.name = "WebsiteReportLanguageValidationError";
    this.draft = draft;
  }
}

interface WebsiteLanguageCorrection { path: string; text: string }

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
  const result = {
    report: finalReport,
    modelId: completion.modelId,
    rejectedFindingIds: verified.rejectedFindingIds,
    rejectedEvidence: verified.rejectedEvidence
  };
  try {
    assertWebsiteReportLanguage(finalReport, input);
  } catch (error) {
    if (error instanceof ReportLanguageValidationError) {
      throw new WebsiteReportLanguageValidationError(error, result);
    }
    throw error;
  }
  return result;
}

export async function synthesizeWebsiteReportWithRecovery(
  client: JsonCompletionClient,
  input: ReportSynthesisInput,
  options: { maxAttempts?: number; delay?: (milliseconds: number) => Promise<void>; signal?: AbortSignal } = {}
): Promise<SynthesizeReportResult> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const delay = options.delay ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    options.signal?.throwIfAborted();
    try {
      return await synthesizeWebsiteReport(client, input, options.signal);
    } catch (error) {
      lastError = error;
      if (error instanceof WebsiteReportLanguageValidationError) {
        if (attempt >= maxAttempts) throw error;
        await delayWithSignal(delay, Math.min(2_000, 250 * (2 ** (attempt - 1))), options.signal);
        return correctWebsiteReportLanguage(client, input, error, options.signal);
      }
      if (attempt < maxAttempts) await delayWithSignal(delay, Math.min(2_000, 250 * (2 ** (attempt - 1))), options.signal);
    }
  }
  throw lastError;
}

async function correctWebsiteReportLanguage(
  client: JsonCompletionClient,
  input: ReportSynthesisInput,
  error: WebsiteReportLanguageValidationError,
  signal?: AbortSignal
): Promise<SynthesizeReportResult> {
  const allowedTerms = collectSourceGroundedAllowedTerms(input);
  const violationPaths = new Set(error.violations.map(({ path }) => path));
  const fieldsToCorrect = websiteReportLanguageFields(error.draft.report)
    .filter(({ path }) => violationPaths.has(path));
  if (fieldsToCorrect.length !== violationPaths.size) throw error;
  const languageInstruction = reportLanguageInstruction(input.locale);
  const completion = await client.completeJson({
    signal,
    temperature: 0.1,
    maxTokens: 8_000,
    messages: [
      {
        role: "system",
        content: `You are a strict GEO report-language editor. Return JSON only. The allowedOriginalTerms list is exhaustive: for Simplified Chinese output, no other Latin-script sequence may appear, even inside quotation marks, examples, markup, code, email labels, or protocol labels. Replace forbidden source-language text with a Chinese description instead of repeating it. ${languageInstruction}`
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Return only corrected replacement prose for the exact supplied paths.",
          rules: [
            languageInstruction,
            "Return exactly one correction for every supplied field path, with no missing, duplicate, or extra paths.",
            "Treat allowedOriginalTerms as the complete and exclusive list of Latin-script text permitted in Chinese replacements.",
            "Never repeat forbidden source-language headings in quotation marks or examples; describe them in Chinese instead.",
            "Do not output markup, code, email labels, or protocol-label examples in corrected prose."
          ],
          correctionRequired: reportLanguageCorrectionFeedback(error, input.locale),
          allowedOriginalTerms: allowedTerms,
          locale: input.locale,
          outputShape: { corrections: [{ path: "exact supplied field path", text: "replacement prose only" }] },
          fieldsToCorrect
        })
      }
    ]
  });
  const corrections = parseWebsiteLanguageCorrections(completion.value, fieldsToCorrect.map(({ path }) => path));
  const normalizedCorrections = corrections?.map((correction) => ({
    ...correction,
    text: normalizeReportCorrectionText(correction.text, input.locale, allowedTerms)
  }));
  const corrected = normalizedCorrections
    ? applyWebsiteLanguageCorrections(error.draft.report, normalizedCorrections)
    : null;
  if (!corrected) throw error;
  assertWebsiteReportLanguage(corrected, input);
  return { ...error.draft, report: corrected };
}

function parseWebsiteLanguageCorrections(value: unknown, expectedPaths: readonly string[]): WebsiteLanguageCorrection[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).corrections;
  if (!Array.isArray(raw) || raw.length !== expectedPaths.length) return null;
  const expected = new Set(expectedPaths);
  const seen = new Set<string>();
  const corrections: WebsiteLanguageCorrection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (typeof record.path !== "string" || !expected.has(record.path) || seen.has(record.path) ||
        typeof record.text !== "string" || !record.text.trim() || record.text.length > 4_000) return null;
    seen.add(record.path);
    corrections.push({ path: record.path, text: record.text.trim() });
  }
  return seen.size === expected.size ? corrections : null;
}

function applyWebsiteLanguageCorrections(
  draft: AiWebsiteReportV1,
  corrections: readonly WebsiteLanguageCorrection[]
): AiWebsiteReportV1 | null {
  const corrected = structuredClone(draft) as AiWebsiteReportV1;
  for (const { path, text } of corrections) {
    const segments = path.replace(/\[(\d+)]/g, ".$1").split(".");
    let parent: unknown = corrected;
    for (const segment of segments.slice(0, -1)) {
      if (!parent || typeof parent !== "object") return null;
      parent = (parent as Record<string, unknown>)[segment];
    }
    const leaf = segments.at(-1)!;
    if (!parent || typeof parent !== "object" || typeof (parent as Record<string, unknown>)[leaf] !== "string") return null;
    (parent as Record<string, unknown>)[leaf] = text;
  }
  return corrected;
}

function assertWebsiteReportLanguage(report: AiWebsiteReportV1, input: ReportSynthesisInput): void {
  const fields = websiteReportLanguageFields(report);
  assertReportLanguage(fields, input.locale, collectSourceGroundedAllowedTerms(input));
  assertGeoTerminology(fields, GEO_TERMINOLOGY_POLICY);
}

function websiteReportLanguageFields(report: AiWebsiteReportV1): Array<{ path: string; text: string }> {
  const roadmap = (["immediate", "nextPhase", "ongoing"] as const).flatMap((phase) =>
    report.roadmap[phase].map((item, index) => ({ phase, index, item }))
  );
  return [
    ...(report.organizationProfile.organizationName
      ? [{ path: "organizationProfile.organizationName", text: report.organizationProfile.organizationName }]
      : []),
    ...report.organizationProfile.brandNames.map((text, index) => ({ path: `organizationProfile.brandNames[${index}]`, text })),
    ...(report.organizationProfile.legalEntity
      ? [{ path: "organizationProfile.legalEntity", text: report.organizationProfile.legalEntity }]
      : []),
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
    ...roadmap.flatMap(({ phase, index: itemIndex, item }) => [
      { path: `roadmap.${phase}[${itemIndex}].title`, text: item.title },
      { path: `roadmap.${phase}[${itemIndex}].rationale`, text: item.rationale },
      ...item.actions.map((text, index) => ({ path: `roadmap.${phase}[${itemIndex}].actions[${index}]`, text }))
    ])
  ];
}

function collectSourceGroundedAllowedTerms(input: ReportSynthesisInput): string[] {
  const terms = new Set<string>();
  for (const page of input.pages) {
    const officialNames = page.metadata?.officialNames;
    for (const value of Array.isArray(officialNames) ? officialNames.slice(0, 32) : []) {
      const name = value.replace(/\s+/g, " ").trim();
      if (name && name.length <= 120) terms.add(name);
    }
    try {
      for (const label of new URL(page.url).hostname.split(".")) {
        if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label) && !HOSTNAME_NOISE.has(label.toLowerCase())) terms.add(label);
      }
    } catch {
      // Invalid page URLs contribute no allowlist term.
    }
    for (const match of page.text.matchAll(/([A-Za-z][A-Za-z0-9+.-]{1,39})(?=[\u3400-\u9fff])/gu)) {
      terms.add(match[1]!);
    }
  }
  return [...terms];
}

const HOSTNAME_NOISE = new Set(["www", "com", "org", "net", "io", "co", "cn"]);

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
