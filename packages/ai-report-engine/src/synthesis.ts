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

export function buildSynthesisPrompt(input: ReportSynthesisInput): string {
  return JSON.stringify({
    task: "Create a commercial-grade, evidence-grounded AI website analysis report.",
    rules: [
      "Use only supplied evidence and analyses.",
      "Every finding must cite an exact supplied URL and a verbatim quote.",
      "Do not claim external domain ownership verification; ownershipVerification must be not-performed.",
      "Scores are semantic AI assessments and must not alter any separate deterministic technical GEO score.",
      "Clearly state uncertainty and sampling limitations.",
      "Write all prose in the requested locale."
    ],
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
  signal?: AbortSignal
): Promise<SynthesizeReportResult> {
  const completion = await client.completeJson({
    signal,
    temperature: 0.1,
    maxTokens: 12_000,
    messages: [
      {
        role: "system",
        content:
          "You are a senior GEO and website intelligence analyst. Produce a decision-useful JSON report grounded exclusively in supplied website evidence. JSON only."
      },
      { role: "user", content: buildSynthesisPrompt(input) }
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

  return {
    report: { ...verified.report, findings: tierFindings },
    modelId: completion.modelId,
    rejectedFindingIds: verified.rejectedFindingIds,
    rejectedEvidence: verified.rejectedEvidence
  };
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
