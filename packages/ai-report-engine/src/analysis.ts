import { isRetryableAiClientError, type JsonCompletionClient } from "./client";
import { validateEvidenceCitation } from "./evidence";
import {
  GEO_TERMINOLOGY_POLICY,
  ReportLanguageValidationError,
  assertGeoTerminology,
  assertReportLanguage,
  normalizeReportCorrectionText,
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
  semanticValidation?: "legacy" | "deferred" | "free_direct";
  batchSize?: number;
  maxCharactersPerPage?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  maxAttempts?: number;
  retryDelay?: (milliseconds: number) => Promise<void>;
  completedAnalyses?: readonly PageAnalysis[];
  onBatchComplete?: (analyses: PageAnalysis[]) => Promise<void> | void;
}

export class PageAnalysisBatchError extends Error {
  readonly completedAnalyses: PageAnalysis[];

  constructor(message: string, completedAnalyses: PageAnalysis[], options?: ErrorOptions) {
    super(message, options);
    this.name = "PageAnalysisBatchError";
    this.completedAnalyses = completedAnalyses;
  }
}

const confidences = new Set<Confidence>(["low", "medium", "high"]);
const severities = new Set<FindingSeverity>(["critical", "warning", "opportunity"]);
const PAGE_ANALYSIS_LIMITS = Object.freeze({
  summaryCharacters: 600,
  collectionItems: 3,
  collectionItemCharacters: 160,
  findings: 3,
  evidenceItems: 2,
  titleCharacters: 120,
  impactCharacters: 280,
  quoteCharacters: 240,
  pageElementCharacters: 100,
  recommendationCharacters: 320,
  rewriteExampleCharacters: 320
});

function boundedText(value: unknown, maxCharacters: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxCharacters
    ? value
    : null;
}

function boundedTextArray(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PAGE_ANALYSIS_LIMITS.collectionItems) return null;
  const parsed = value.map((item) => boundedText(item, PAGE_ANALYSIS_LIMITS.collectionItemCharacters));
  return parsed.some((item) => item === null) ? null : parsed as string[];
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

function parseEvidence(value: unknown): Array<{ url: string; quote: string; pageElement?: string }> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > PAGE_ANALYSIS_LIMITS.evidenceItems) return null;
  const parsed = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const record = item as Record<string, unknown>;
    const url = boundedText(record.url, 2_000);
    const quote = boundedText(record.quote, PAGE_ANALYSIS_LIMITS.quoteCharacters);
    const pageElement = record.pageElement === undefined
      ? undefined
      : boundedText(record.pageElement, PAGE_ANALYSIS_LIMITS.pageElementCharacters);
    if (!url || !quote || pageElement === null) return null;
    return { url, quote, ...(pageElement ? { pageElement } : {}) };
  });
  return parsed.some((item) => item === null)
    ? null
    : parsed as Array<{ url: string; quote: string; pageElement?: string }>;
}

function parseFinding(value: unknown, pages: readonly ExtractedPage[]): PageAnalysisFinding | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = boundedText(record.title, PAGE_ANALYSIS_LIMITS.titleCharacters);
  const impact = boundedText(record.impact, PAGE_ANALYSIS_LIMITS.impactCharacters);
  const recommendation = boundedText(record.recommendation, PAGE_ANALYSIS_LIMITS.recommendationCharacters);
  const rewriteExample = record.rewriteExample === undefined
    ? undefined
    : boundedText(record.rewriteExample, PAGE_ANALYSIS_LIMITS.rewriteExampleCharacters);
  if (
    !title || !impact || !recommendation || rewriteExample === null ||
    typeof record.severity !== "string" ||
    !severities.has(record.severity as FindingSeverity) ||
    typeof record.confidence !== "string" ||
    !confidences.has(record.confidence as Confidence)
  ) {
    return null;
  }
  const evidence = parseEvidence(record.evidence);
  if (
    !evidence ||
    evidence.some((citation) => !validateEvidenceCitation(citation, pages).valid)
  ) {
    return null;
  }
  return {
    title,
    severity: record.severity as FindingSeverity,
    impact,
    evidence,
    recommendation,
    ...(rewriteExample ? { rewriteExample } : {}),
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
    if (typeof record.url !== "string") continue;
    const url = canonicalUrl(record.url);
    const page = url ? pagesByUrl.get(url) : undefined;
    if (!url || !page || seen.has(url)) continue;
    const summary = boundedText(record.summary, PAGE_ANALYSIS_LIMITS.summaryCharacters);
    const organizationSignals = boundedTextArray(record.organizationSignals);
    const strengths = boundedTextArray(record.strengths);
    if (!summary || !organizationSignals || !strengths) continue;
    seen.add(url);
    if (record.findings !== undefined && (!Array.isArray(record.findings) || record.findings.length > PAGE_ANALYSIS_LIMITS.findings)) continue;
    const findings = Array.isArray(record.findings)
      ? record.findings
          .map((finding) => parseFinding(finding, pages))
          .filter((finding): finding is PageAnalysisFinding => finding !== null)
      : [];
    analyses.push({
      url: page.url,
      pageType: page.pageType,
      summary,
      organizationSignals,
      strengths,
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
      record.text.length > pageAnalysisFieldMaxCharacters(record.path)
    ) return null;
    seen.add(record.path);
    corrections.push({ path: record.path, text: record.text.trim() });
  }
  return seen.size === expected.size ? corrections : null;
}

function pageAnalysisFieldMaxCharacters(path: string): number {
  if (/\.summary$/u.test(path)) return PAGE_ANALYSIS_LIMITS.summaryCharacters;
  if (/\.(?:organizationSignals|strengths)\[\d+\]$/u.test(path)) return PAGE_ANALYSIS_LIMITS.collectionItemCharacters;
  if (/\.title$/u.test(path)) return PAGE_ANALYSIS_LIMITS.titleCharacters;
  if (/\.impact$/u.test(path)) return PAGE_ANALYSIS_LIMITS.impactCharacters;
  if (/\.recommendation$/u.test(path)) return PAGE_ANALYSIS_LIMITS.recommendationCharacters;
  if (/\.rewriteExample$/u.test(path)) return PAGE_ANALYSIS_LIMITS.rewriteExampleCharacters;
  return 0;
}

function applyPageLanguageCorrections(
  draft: readonly PageAnalysis[],
  corrections: readonly PageLanguageCorrection[]
): PageAnalysis[] | null {
  const corrected = clonePageAnalyses(draft);
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

function clonePageAnalyses(draft: readonly PageAnalysis[]): PageAnalysis[] {
  return draft.map((analysis) => ({
    ...analysis,
    organizationSignals: [...analysis.organizationSignals],
    strengths: [...analysis.strengths],
    findings: analysis.findings.map((finding) => ({
      ...finding,
      evidence: finding.evidence.map((citation) => ({ ...citation }))
    }))
  }));
}

function omitInvalidOptionalPageAnalysisProse(
  draft: readonly PageAnalysis[],
  error: ReportLanguageValidationError
): PageAnalysis[] | null {
  if (error.violations.length === 0) return null;
  const corrected = clonePageAnalyses(draft);
  const arrayRemovals = new Map<string, {
    analysisIndex: number;
    field: "organizationSignals" | "strengths";
    indices: Set<number>;
  }>();
  for (const { path } of error.violations) {
    const rewriteMatch = /^analyses\[(\d+)]\.findings\[(\d+)]\.rewriteExample$/.exec(path);
    if (rewriteMatch) {
      const finding = corrected[Number(rewriteMatch[1])]?.findings[Number(rewriteMatch[2])];
      if (!finding || finding.rewriteExample === undefined) return null;
      delete finding.rewriteExample;
      continue;
    }
    const arrayMatch = /^analyses\[(\d+)]\.(organizationSignals|strengths)\[(\d+)]$/.exec(path);
    if (!arrayMatch) return null;
    const analysisIndex = Number(arrayMatch[1]);
    const field = arrayMatch[2] as "organizationSignals" | "strengths";
    const itemIndex = Number(arrayMatch[3]);
    const collection = corrected[analysisIndex]?.[field];
    if (!collection || itemIndex >= collection.length) return null;
    const key = `${analysisIndex}:${field}`;
    const removal = arrayRemovals.get(key) ?? { analysisIndex, field, indices: new Set<number>() };
    removal.indices.add(itemIndex);
    arrayRemovals.set(key, removal);
  }
  for (const { analysisIndex, field, indices } of arrayRemovals.values()) {
    const analysis = corrected[analysisIndex]!;
    analysis[field] = analysis[field].filter((_, index) => !indices.has(index));
  }
  return corrected;
}

export async function analyzePageBatch(
  client: JsonCompletionClient,
  input: AnalyzePagesInput
): Promise<PageAnalysisBatch> {
  const semanticDirect = input.semanticValidation === "free_direct";
  const semanticDeferred = input.semanticValidation === "deferred" || semanticDirect;
  const batchSize = Math.max(1, Math.min(input.batchSize ?? 4, 10));
  const maxCharacters = Math.max(1_000, Math.min(input.maxCharactersPerPage ?? 30_000, 100_000));
  const maxOutputTokens = input.maxOutputTokens ?? 8_000;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256) {
    throw new TypeError("maxOutputTokens must be a positive bounded token budget.");
  }
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
    let languageFeedback: string[] = [];
    let languageCorrectionDraft: PageAnalysis[] | undefined;
    let languageCorrectionError: ReportLanguageValidationError | undefined;
    let fieldsToCorrect: Array<{ path: string; text: string }> = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const isLanguageCorrectionCall = !semanticDeferred && languageFeedback.length > 0;
      let correctionCandidateApplied = false;
      try {
        input.signal?.throwIfAborted();
        const languageInstruction = semanticDeferred
          ? naturalLanguageInstruction(input.locale)
          : reportLanguageInstruction(input.locale);
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
      maxTokens: maxOutputTokens,
      messages: [
        {
          role: "system",
          content: isLanguageCorrectionCall
            ? `You are a strict GEO report-language editor. Return JSON only. Rewrite only the flagged report-prose fields. The allowedOriginalTerms list is exhaustive: for Simplified Chinese output, no other Latin-script sequence may appear, even inside quotation marks, examples, markup, code, email labels, or protocol labels. Replace forbidden source-language text with a Chinese description instead of repeating it. ${languageInstruction}`
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
              "Treat allowedOriginalTerms as the complete and exclusive list of Latin-script text permitted in Chinese replacements.",
              "Never repeat forbidden source-language headings in quotation marks or examples; describe them in Chinese instead.",
              "Do not output markup, code, email labels, or protocol-label examples in corrected prose.",
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
              "Keep evidence quotes verbatim in their source language.",
              "Observe every supplied output limit exactly; omit optional content instead of exceeding a limit."
            ],
            locale: input.locale,
            outputLimits: PAGE_ANALYSIS_LIMITS,
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
              const normalized = corrections?.map((correction) => ({
                ...correction,
                text: normalizeReportCorrectionText(correction.text, input.locale, allowedTerms)
              }));
              return languageCorrectionDraft && normalized
                ? applyPageLanguageCorrections(languageCorrectionDraft, normalized)
                : null;
            })()
          : parseBatch(completion.value, pages);
        if (!candidate || candidate.length !== pages.length) {
          if (isLanguageCorrectionCall && languageCorrectionError) throw languageCorrectionError;
          throw new Error(`The model returned ${candidate?.length ?? 0} of ${pages.length} required page analyses.`);
        }
        languageCorrectionDraft = candidate;
        correctionCandidateApplied = isLanguageCorrectionCall;
        if (!semanticDeferred) assertPageAnalysisLanguage(candidate, input.locale, allowedTerms);
        parsed = candidate;
        break;
      } catch (error) {
        lastError = error;
        if (semanticDirect) {
          if (!isRetryableAiClientError(error) || attempt >= maxAttempts) break;
          await retryDelay(Math.min(2_000, 250 * (2 ** (attempt - 1))));
          continue;
        }
        if (isLanguageCorrectionCall && error instanceof ReportLanguageValidationError) {
          const withoutInvalidOptionalProse = omitInvalidOptionalPageAnalysisProse(languageCorrectionDraft ?? [], error);
          if (withoutInvalidOptionalProse) {
            assertPageAnalysisLanguage(withoutInvalidOptionalProse, input.locale, allowedTerms);
            parsed = withoutInvalidOptionalProse;
            break;
          }
        }
        if (isLanguageCorrectionCall && (!correctionCandidateApplied || !(error instanceof ReportLanguageValidationError))) {
          throw error;
        }
        if (error instanceof ReportLanguageValidationError) {
          if (attempt >= maxAttempts) throw error;
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
        analyses,
        { cause: lastError }
      );
    }
    analyses.push(...parsed);
    await input.onBatchComplete?.(parsed);
  }

  return { analyses, modelId };
}

function naturalLanguageInstruction(locale: string): string {
  return `Write natural customer prose for locale ${locale}. Preserve appropriate brand names, product names, acronyms, model names, and professional terms in their original form.`;
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
      const hostname = new URL(page.url).hostname.toLocaleLowerCase().replace(/^www\./u, "");
      if (hostname.includes(".")) terms.add(hostname);
      for (const label of hostname.split(".")) {
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
    for (const match of page.text.matchAll(/([A-Za-z][A-Za-z0-9+.-]{1,39})(?=[\u3400-\u9fff])/gu)) {
      terms.add(match[1]!);
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
