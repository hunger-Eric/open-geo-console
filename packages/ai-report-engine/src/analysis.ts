import type { JsonCompletionClient } from "./client";
import { validateEvidenceCitation } from "./evidence";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
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
    let parsed: PageAnalysis[] | undefined;
    let lastError: unknown;
    let languageCorrectionUsed = false;
    let languageFeedback: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isLanguageCorrectionCall = languageFeedback.length > 0;
      try {
        const languageInstruction = reportLanguageInstruction(input.locale);
        const completion = await client.completeJson({
      signal: input.signal,
      temperature: 0.1,
      maxTokens: 8_000,
      messages: [
        {
          role: "system",
          content:
            `You are an evidence-first GEO website analyst. Return JSON only. Analyze only supplied page text. Every formal finding must contain at least one verbatim quote copied from the supplied page and its exact URL. Do not make external ownership, market, traffic, ranking, or performance claims. ${languageInstruction}`
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze each website page for organization clarity, information architecture, content citability, trust evidence, entity consistency and GEO understandability.",
            rules: [
              languageInstruction,
              "Keep evidence quotes verbatim in their source language."
            ],
            ...(languageFeedback.length ? { correctionRequired: languageFeedback } : {}),
            locale: input.locale,
            outputShape: {
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
            },
            pages: pages.map((page) => pageForPrompt(page, maxCharacters))
          })
        }
      ]
        });
        modelId = completion.modelId;
        const candidate = parseBatch(completion.value, pages);
        if (candidate.length !== pages.length) {
          throw new Error(`The model returned ${candidate.length} of ${pages.length} required page analyses.`);
        }
        assertPageAnalysisLanguage(candidate, input.locale, allowedTermsFromPageTitles(pages));
        parsed = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (isLanguageCorrectionCall) throw error;
        if (error instanceof ReportLanguageValidationError) {
          if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
          languageCorrectionUsed = true;
          languageFeedback = languageViolationFeedback(error);
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

function assertPageAnalysisLanguage(analyses: readonly PageAnalysis[], locale: string, allowedTerms: readonly string[]): void {
  assertReportLanguage(analyses.flatMap((analysis, analysisIndex) => [
    { path: `analyses[${analysisIndex}].summary`, text: analysis.summary },
    ...analysis.organizationSignals.map((text, index) => ({ path: `analyses[${analysisIndex}].organizationSignals[${index}]`, text })),
    ...analysis.strengths.map((text, index) => ({ path: `analyses[${analysisIndex}].strengths[${index}]`, text })),
    ...analysis.findings.flatMap((finding, findingIndex) => [
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].title`, text: finding.title },
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].impact`, text: finding.impact },
      { path: `analyses[${analysisIndex}].findings[${findingIndex}].recommendation`, text: finding.recommendation },
      ...(finding.rewriteExample ? [{ path: `analyses[${analysisIndex}].findings[${findingIndex}].rewriteExample`, text: finding.rewriteExample }] : [])
    ])
  ]), locale, allowedTerms);
}

function allowedTermsFromPageTitles(pages: readonly ExtractedPage[]): string[] {
  return uniqueBoundedTerms(pages.map(({ title }) => title));
}

function uniqueBoundedTerms(values: readonly (string | undefined)[]): string[] {
  const terms = values.flatMap((value) => {
    if (!value) return [];
    const latin = value.match(/\b(?:[A-Z][A-Za-z0-9&.-]*)(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3}\b/g) ?? [];
    const cjk = value.match(/[\u3400-\u9fff]{2,12}/gu) ?? [];
    return [...latin, ...cjk].filter((term) => term.length <= 80);
  });
  return [...new Set(terms)];
}

function languageViolationFeedback(error: ReportLanguageValidationError): string[] {
  return error.violations.map(({ path, reason }) => `${path}: ${reason}`);
}

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
