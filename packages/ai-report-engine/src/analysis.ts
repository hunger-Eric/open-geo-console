import type { JsonCompletionClient } from "./client";
import { validateEvidenceCitation } from "./evidence";
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
  const analyses: PageAnalysis[] = [];
  let modelId = client.configuredModel;

  for (let start = 0; start < input.pages.length; start += batchSize) {
    const pages = input.pages.slice(start, start + batchSize);
    const completion = await client.completeJson({
      signal: input.signal,
      temperature: 0.1,
      maxTokens: 8_000,
      messages: [
        {
          role: "system",
          content:
            "You are an evidence-first GEO website analyst. Return JSON only. Analyze only supplied page text. Every formal finding must contain at least one verbatim quote copied from the supplied page and its exact URL. Do not make external ownership, market, traffic, ranking, or performance claims."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Analyze each website page for organization clarity, information architecture, content citability, trust evidence, entity consistency and GEO understandability.",
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
    analyses.push(...parseBatch(completion.value, pages));
  }

  return { analyses, modelId };
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
