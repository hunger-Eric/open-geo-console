import type {
  CombinedGeoReportV4Question,
  CombinedGeoReportV4Source
} from "@open-geo-console/ai-report-engine";

export type ReportV4SourceAuditRead =
  | { readonly status: "available"; readonly summary?: string }
  | { readonly status: "insufficient" }
  | { readonly status: "inaccessible" };

export interface ReportV4SourceAuditDependencies {
  readonly readRawSource: (
    source: CombinedGeoReportV4Source,
    signal?: AbortSignal
  ) => Promise<ReportV4SourceAuditRead>;
  readonly renderBrowserSource: (
    source: CombinedGeoReportV4Source,
    signal?: AbortSignal
  ) => Promise<ReportV4SourceAuditRead>;
}

export interface ReportV4SourceAudit {
  readonly questionId: string;
  readonly sourceId: string;
  readonly canonicalUrl: string;
  readonly status: "available" | "inaccessible";
  readonly summary?: string;
}

export interface ReportV4QuestionSourceAuditResult {
  /** The persisted question is retained unchanged; audits are an independent sidecar. */
  readonly question: CombinedGeoReportV4Question;
  readonly sourceAudits: readonly ReportV4SourceAudit[];
}

export async function auditReportV4Sources(
  questions: ReadonlyArray<CombinedGeoReportV4Question>,
  dependencies: ReportV4SourceAuditDependencies,
  signal?: AbortSignal
): Promise<ReportV4QuestionSourceAuditResult[]> {
  const results: ReportV4QuestionSourceAuditResult[] = [];
  for (const question of questions) {
    signal?.throwIfAborted();
    const ownedSources = question.sources
      .filter((source) => source.questionId === question.questionId)
      .slice(0, 5);
    const sourceAudits: ReportV4SourceAudit[] = [];
    for (const source of ownedSources) {
      sourceAudits.push(await auditSource(source, dependencies, signal));
    }
    results.push({ question, sourceAudits });
  }
  return results;
}

async function auditSource(
  source: CombinedGeoReportV4Source,
  dependencies: ReportV4SourceAuditDependencies,
  signal?: AbortSignal
): Promise<ReportV4SourceAudit> {
  signal?.throwIfAborted();
  let raw: ReportV4SourceAuditRead;
  try {
    raw = await dependencies.readRawSource(source, signal);
  } catch {
    propagateCallerAbort(signal);
    return inaccessible(source);
  }
  signal?.throwIfAborted();
  if (raw.status === "available") return available(source, raw.summary);
  if (raw.status === "inaccessible") return inaccessible(source);

  let rendered: ReportV4SourceAuditRead;
  try {
    rendered = await dependencies.renderBrowserSource(source, signal);
  } catch {
    propagateCallerAbort(signal);
    return inaccessible(source);
  }
  signal?.throwIfAborted();
  return rendered.status === "available"
    ? available(source, rendered.summary)
    : inaccessible(source);
}

function available(source: CombinedGeoReportV4Source, summary: string | undefined): ReportV4SourceAudit {
  const normalizedSummary = summary?.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return {
    questionId: source.questionId,
    sourceId: source.sourceId,
    canonicalUrl: source.canonicalUrl,
    status: "available",
    ...(normalizedSummary ? { summary: normalizedSummary } : {})
  };
}

function inaccessible(source: CombinedGeoReportV4Source): ReportV4SourceAudit {
  return {
    questionId: source.questionId,
    sourceId: source.sourceId,
    canonicalUrl: source.canonicalUrl,
    status: "inaccessible"
  };
}

function propagateCallerAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason;
}
