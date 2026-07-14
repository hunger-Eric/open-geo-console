import type { JsonCompletionClient } from "./client";
import { validateEvidenceCitation } from "./evidence";
import {
  GEO_TERMINOLOGY_POLICY,
  ReportLanguageValidationError,
  assertGeoTerminology,
  assertReportLanguage,
  reportLanguageCorrectionFeedback,
  reportLanguageInstruction
} from "./report-language";
import type {
  Confidence,
  ExtractedPage,
  FindingSeverity,
  PageAnalysis,
  PageAnalysisBatch,
  PageAnalysisFinding,
  PageType
} from "./types";

export interface AnalyzePagesInput {
  pages: readonly ExtractedPage[];
  locale: string;
  batchSize?: number;
  maxCharactersPerPage?: number;
  signal?: AbortSignal;
  maxAttempts?: number;
  retryDelay?: (milliseconds: number) => Promise<void>;
  completedAnalyses?: readonly PageAnalysis[];
  onBatchComplete?: (analyses: PageAnalysis[]) => Promise<void> | void;
}

export class PageAnalysisBatchError extends Error {
  readonly completedAnalyses: PageAnalysis[];

  constructor(message: string, completedAnalyses: PageAnalysis[]) {
    super(message);
    this.name = "PageAnalysisBatchError";
    this.completedAnalyses = completedAnalyses;
  }
}

const confidences = new Set<Confidence>(["low", "medium", "high"]);
const severities = new Set<FindingSeverity>(["critical", "warning", "opportunity"]);

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function parseEvidence(value: unknown): Array<{ url: string; quote: string; pageElement?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string" || typeof record.quote !== "string") return [];
    return [{
      url: record.url,
      quote: record.quote,
      ...(typeof record.pageElement === "string" ? { pageElement: record.pageElement } : {})
    }];
  });
}

function parseFinding(value: unknown, pages: readonly ExtractedPage[]): PageAnalysisFinding | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.title !== "string" ||
    typeof record.impact !== "string" ||
    typeof record.recommendation !== "string" ||
    typeof record.severity !== "string" ||
    !severities.has(record.severity as FindingSeverity) ||
    typeof record.confidence !== "string" ||
    !confidences.has(record.confidence as Confidence)
  ) {
    return null;
  }
  const evidence = parseEvidence(record.evidence);
  if (
    evidence.length === 0 ||
    evidence.some((citation) => !validateEvidenceCitation(citation, pages).valid)
  ) {
    return null;
  }
  return {
    title: record.title,
    severity: record.severity as FindingSeverity,
    impact: record.impact,
    evidence,
    recommendation: record.recommendation,
    ...(typeof record.rewriteExample === "string" ? { rewriteExample: record.rewriteExample } : {}),
    confidence: record.confidence as Confidence
  };
}

function parseBatch(value: unknown, pages: readonly ExtractedPage[]): PageAnalysis[] {
  if (!value || typeof value !== "object") return [];
  const rawAnalyses = (value as Record<string, unknown>).analyses;
  if (!Array.isArray(rawAnalyses)) return [];
  const pagesByUrl = new Map(
    pages.map((page) => [canonicalUrl(page.url), page] as const).filter((item) => item[0] !== null)
  );
  const seen = new Set<string>();
  const analyses: PageAnalysis[] = [];

  for (const item of rawAnalyses) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.url !== "string" || typeof record.summary !== "string") continue;
    const url = canonicalUrl(record.url);
    const page = url ? pagesByUrl.get(url) : undefined;
    if (!url || !page || seen.has(url)) continue;
    seen.add(url);
    const findings = Array.isArray(record.findings)
      ? record.findings
          .map((finding) => parseFinding(finding, pages))
          .filter((finding): finding is PageAnalysisFinding => finding !== null)
      : [];
    analyses.push({
      url: page.url,
      pageType: page.pageType,
      summary: record.summary,
      organizationSignals: stringArray(record.organizationSignals),
      strengths: stringArray(record.strengths),
      findings
    });
  }
  return analyses;
}

function pageForPrompt(page: ExtractedPage, maxCharacters: number): Record<string, unknown> {
  return {
    url: page.url,
    pageType: page.pageType,
    title: page.title,
    description: page.description,
    metadata: page.metadata,
    text: page.text.slice(0, maxCharacters)
  };
}

interface PageLanguageCorrection {
  path: string;
  text: string;
}

function parsePageLanguageCorrections(value: unknown, expectedPaths: readonly string[]): PageLanguageCorrection[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>).corrections;
  if (!Array.isArray(raw) || raw.length !== expectedPaths.length) return null;
  const expected = new Set(expectedPaths);
  const seen = new Set<string>();
  const corrections: PageLanguageCorrection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    if (
      typeof record.path !== "string" ||
      !expected.has(record.path) ||
      seen.has(record.path) ||
      typeof record.text !== "string" ||
      record.text.trim().length === 0 ||
      record.text.length > 4_000
    ) return null;
    seen.add(record.path);
    corrections.push({ path: record.path, text: record.text.trim() });
  }
  return seen.size === expected.size ? corrections : null;
}

function applyPageLanguageCorrections(
  draft: readonly PageAnalysis[],
  corrections: readonly PageLanguageCorrection[]
): PageAnalysis[] | null {
  const corrected = draft.map((analysis) => ({
    ...analysis,
    organizationSignals: [...analysis.organizationSignals],
    strengths: [...analysis.strengths],
    findings: analysis.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((citation) => ({ ...citation }))
    }))
  }));
  for (const { path, text } of corrections) {
    let match = /^analyses\[(\d+)]\.(summary)$/.exec(path);
    if (match) {
      const analysis = corrected[Number(match[1])];
      if (!analysis) return null;
      analysis.summary = text;
      continue;
    }
    match = /^analyses\[(\d+)]\.(organizationSignals|strengths)\[(\d+)]$/.exec(path);
    if (match) {
      const analysis = corrected[Number(match[1])];
      const collection = match[2] === "organizationSignals" ? analysis?.organizationSignals : analysis?.strengths;
      const index = Number(match[3]);
      if (!collection || index >= collection.length) return null;
      collection[index] = text;
      continue;
    }
    match = /^analyses\[(\d+)]\.findings\[(\d+)]\.(title|impact|recommendation|rewriteExample)$/.exec(path);
    if (match) {
      const finding = corrected[Number(match[1])]?.findings[Number(match[2])];
      if (!finding) return null;
      const field = match[3] as "title" | "impact" | "recommendation" | "rewriteExample";
      if (field === "rewriteExample" && finding.rewriteExample === undefined) return null;
      finding[field] = text;
      continue;
    }
    return null;
  }
  return corrected;
}

export async function analyzePageBatch(
  client: JsonCompletionClient,
  input: AnalyzePagesInput
): Promise<PageAnalysisBatch> {
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 4, 10));
  const maxCharacters = Math.max(1_000, Math.min(input.maxCharactersPerPage ?? 30_000, 100_000));
  const analyses: PageAnalysis[] = [...(input.completedAnalyses ?? [])];
  const completedUrls = new Set(analyses.map(({ url }) => canonicalUrl(url)));
  const pendingPages = input.pages.filter((page) => !completedUrls.has(canonicalUrl(page.url)));
  let modelId = client.configuredModel;
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const retryDelay = input.retryDelay ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  for (let start = 0; start < pendingPages.length; start += batchSize) {
    const pages = pendingPages.slice(start, start + batchSize);
    const allowedTerms = collectPageAllowedTerms(pages);
    let parsed: PageAnalysis[] | undefined;
    let lastError: unknown;
    let languageCorrectionUsed = false;
    let languageFeedback: string[] = [];
    let languageCorrectionDraft: PageAnalysis[] | undefined;
    let languageCorrectionError: ReportLanguageValidationError | undefined;
    let fieldsToCorrect: Array<{ path: string; text: string }> = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isLanguageCorrectionCall = languageFeedback.length > 0;
      try {
        const languageInstruction = reportLanguageInstruction(input.locale);
        const outputShape = isLanguageCorrectionCall ? {
          corrections: [{ path: "exact supplied field path", text: "replacement prose only" }]
        } : {
          analyses: [{
            url: "exact supplied URL",
            pageType: "supplied page type",
            summary: "evidence-grounded summary",
            organizationSignals: ["signal"],
            strengths: ["strength"],
            findings: [{
              title: "finding",
              severity: "critical|warning|opportunity",
              impact: "impact",
              evidence: [{ url: "exact supplied URL", quote: "verbatim supplied text", pageElement: "optional" }],
              recommendation: "specific action",
              rewriteExample: "optional example",
              confidence: "low|medium|high"
            }]
          }]
        };
        const completion = await client.completeJson({
      signal: input.signal,
      temperature: 0.1,
      maxTokens: 8_000,
      messages: [
        {
          role: "system",
          content: isLanguageCorrectionCall
            ? `You are a strict GEO report-language editor. Return JSON only. Rewrite only the flagged report-prose fields. Preserve URLs, page types, severities, confidence values, and every evidence object exactly. ${languageInstruction}`
            : `You are an evidence-first GEO website analyst. Return JSON only. Analyze only supplied page text. Every formal finding must contain at least one verbatim quote copied from the supplied page and its exact URL. Do not make external ownership, market, traffic, ranking, or performance claims. ${languageInstruction}`
        },
        {
          role: "user",
          content: JSON.stringify(isLanguageCorrectionCall ? {
            task: "Correct the supplied draft without re-analyzing the source pages.",
            rules: [
              languageInstruction,
              "Rewrite every flagged prose field in the required language.",
              "Translate or omit every other Latin-script word outside evidence quote fields.",
              "Return exactly one correction for every supplied field path, with no missing, duplicate, or extra paths.",
              "Return only replacement prose; do not add evidence, brands, platforms, claims, or other fields."
            ],
            correctionRequired: languageFeedback,
            allowedOriginalTerms: allowedTerms,
            locale: input.locale,
            outputShape,
            fieldsToCorrect
          } : {
            task: "Analyze each website page for organization clarity, information architecture, content citability, trust evidence, entity consistency and GEO understandability.",
            rules: [
              languageInstruction,
              "Keep evidence quotes verbatim in their source language."
            ],
            locale: input.locale,
            outputShape,
            pages: pages.map((page) => pageForPrompt(page, maxCharacters))
          })
        }
      ]
        });
        modelId = completion.modelId;
        const candidate = isLanguageCorrectionCall
          ? (() => {
              const corrections = parsePageLanguageCorrections(completion.value, fieldsToCorrect.map(({ path }) => path));
              return languageCorrectionDraft && corrections
                ? applyPageLanguageCorrections(languageCorrectionDraft, corrections)
                : null;
            })()
          : parseBatch(completion.value, pages);
        if (!candidate || candidate.length !== pages.length) {
          if (isLanguageCorrectionCall && languageCorrectionError) throw languageCorrectionError;
          throw new Error(`The model returned ${candidate?.length ?? 0} of ${pages.length} required page analyses.`);
        }
        if (!isLanguageCorrectionCall) languageCorrectionDraft = candidate;
        assertPageAnalysisLanguage(candidate, input.locale, allowedTerms);
        parsed = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (isLanguageCorrectionCall) throw error;
        if (error instanceof ReportLanguageValidationError) {
          if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
          languageCorrectionUsed = true;
          languageCorrectionError = error;
          languageFeedback = reportLanguageCorrectionFeedback(error, input.locale);
          const violationPaths = new Set(error.violations.map(({ path }) => path));
          fieldsToCorrect = pageAnalysisLanguageFields(languageCorrectionDraft ?? [])
            .filter(({ path }) => violationPaths.has(path));
          if (fieldsToCorrect.length !== violationPaths.size) throw error;
        }
        if (attempt < maxAttempts) await retryDelay(Math.min(2_000, 250 * (2 ** (attempt - 1))));
      }
    }
    if (!parsed) {
      throw new PageAnalysisBatchError(
        lastError instanceof Error ? lastError.message : "The page analysis batch failed.",
        analyses
      );
    }
    analyses.push(...parsed);
    await input.onBatchComplete?.(parsed);
  }

  return { analyses, modelId };
}

function pageAnalysisLanguageFields(analyses: readonly PageAnalysis[]): Array<{ path: string; text: string }> {
  return analyses.flatMap((analysis, analysisIndex) => [
    { path: `analyses[${analysisIndex}].summary`, text: analysis.summary },
    ...analysis.organizationSignals.map((text, index) => ({ path: `analyses[${analysisIndex}].organizationSignals[${index}]`, text })),
    ...analysis.strengths.map((text, index) => ({ path: `analyses[${analysisIndex}].strengths[${index}]`, text })),
    ...analysis.findings.flatMap((finding, findingIndex) => [
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].title`, text: finding.title },
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].impact`, text: finding.impact },
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].recommendation`, text: finding.recommendation },
      ...(finding.rewriteExample ? [{ path: `analyses[${analysisIndex}].findings[${findingIndex}].rewriteExample`, text: finding.rewriteExample }] : [])
    ])
  ]);
}

function assertPageAnalysisLanguage(analyses: readonly PageAnalysis[], locale: string, allowedTerms: readonly string[]): void {
  const fields = pageAnalysisLanguageFields(analyses);
  assertReportLanguage(fields, locale, allowedTerms);
  assertGeoTerminology(fields, GEO_TERMINOLOGY_POLICY);
}

function collectPageAllowedTerms(pages: readonly ExtractedPage[]): string[] {
  const terms = new Set<string>();
  for (const page of pages) {
    try {
      for (const label of new URL(page.url).hostname.split(".")) {
        if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label) && !HOSTNAME_NOISE.has(label.toLowerCase())) terms.add(label);
      }
    } catch {
      // URL validity is enforced before analysis; an invalid value contributes no allowlist term.
    }
    const officialNames = page.metadata?.officialNames;
    for (const value of Array.isArray(officialNames) ? officialNames.slice(0, 32) : []) {
      const name = value.replace(/\s+/g, " ").trim();
      if (name && name.length <= 120) terms.add(name);
    }
  }
  return [...terms];
}

const HOSTNAME_NOISE = new Set(["www", "com", "org", "net", "io", "co", "cn"]);

export function createFallbackPageAnalysis(page: ExtractedPage): PageAnalysis {
  return {
    url: page.url,
    pageType: page.pageType as PageType,
    summary: "The model did not return a valid evidence-grounded analysis for this page.",
    organizationSignals: [],
    strengths: [],
    findings: []
  };
}
