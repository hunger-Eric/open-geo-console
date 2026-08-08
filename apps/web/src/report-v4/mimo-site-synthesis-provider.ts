import {
  parseReportV4PageAnalysisOutput,
  parseReportV4SiteSynthesisInput,
  parseReportV4WebsiteSynthesisOutput,
  type ReportV4PageAnalysisContext,
  type ReportV4PageSummary,
  type ReportV4WebsiteSynthesisOutput
} from "@open-geo-console/ai-report-engine";
import {
  buildReportV4MimoStructuredTokenBudget,
  createReportV4MimoStructuredInvoker,
  type ProviderDependencies,
  type ReportV4MimoStructuredInvokeInput,
  type ReportV4StructuredInvoker
} from "./mimo-provider";
import { type ReportV4ModelRuntimeConfig } from "./model-runtime-config";

export interface ReportV4MimoPageAnalysisInput {
  readonly context: ReportV4PageAnalysisContext;
  /** Only the bounded retained text for this page may be sent. */
  readonly retainedText: string;
}

export interface ReportV4MimoWebsiteSynthesisInput {
  readonly targetUrl: string;
  readonly locale: string;
  /** Must be the exact 1-50 page summaries returned by loadForWebsiteSynthesis. */
  readonly pages: readonly ReportV4PageSummary[];
}

export interface ReportV4MimoSiteSynthesisProvider {
  readonly analyzePage: (input: ReportV4MimoPageAnalysisInput, signal: AbortSignal) => Promise<ReportV4PageSummary>;
  readonly synthesizeWebsite: (input: ReportV4MimoWebsiteSynthesisInput, signal: AbortSignal) => Promise<ReportV4WebsiteSynthesisOutput>;
}

export class ReportV4MimoSiteSynthesisOutputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReportV4MimoSiteSynthesisOutputError";
  }
}

interface ReportV4EvidenceSegment {
  readonly segmentId: string;
  readonly text: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export function buildReportV4MimoPageAnalysisTokenBudget(runtime: ReportV4ModelRuntimeConfig, input: ReportV4MimoPageAnalysisInput): ReturnType<typeof buildReportV4MimoStructuredTokenBudget> {
  const canonical = canonicalPageInput(input);
  return buildReportV4MimoStructuredTokenBudget(runtime, pageInvocation(canonical, new AbortController().signal));
}

export function buildReportV4MimoWebsiteSynthesisTokenBudget(runtime: ReportV4ModelRuntimeConfig, input: ReportV4MimoWebsiteSynthesisInput): ReturnType<typeof buildReportV4MimoStructuredTokenBudget> {
  const canonical = canonicalWebsiteInput(input);
  return buildReportV4MimoStructuredTokenBudget(runtime, websiteInvocation(canonical, new AbortController().signal));
}

export function createReportV4MimoSiteSynthesisProvider(
  dependencies: ProviderDependencies
): ReportV4MimoSiteSynthesisProvider {
  const invoker = createReportV4MimoStructuredInvoker(dependencies);
  return createReportV4SiteSynthesisProvider(invoker, "MiMo");
}

export function createReportV4SiteSynthesisProvider(
  invoker: ReportV4StructuredInvoker,
  providerLabel: string
): ReportV4MimoSiteSynthesisProvider {
  return Object.freeze({
    async analyzePage(input: ReportV4MimoPageAnalysisInput, signal: AbortSignal) {
      const canonical = canonicalPageInput(input);
      const value = await invoker.invoke(pageInvocation(canonical, signal));
      try {
        return parseReportV4PageAnalysisOutput(
          mapSegmentSelectionToSourceLocations(value, evidenceSegments(canonical.retainedText)),
          canonical.context
        );
      } catch (error) {
        signal.throwIfAborted();
        throw new ReportV4MimoSiteSynthesisOutputError(
          `${providerLabel} returned an invalid V4 page-analysis contract.`,
          { cause: error }
        );
      }
    },
    async synthesizeWebsite(input: ReportV4MimoWebsiteSynthesisInput, signal: AbortSignal) {
      const value = await invoker.invoke(websiteInvocation(canonicalWebsiteInput(input), signal));
      return parseReportV4WebsiteSynthesisOutput(value);
    }
  });
}

function canonicalPageInput(input: ReportV4MimoPageAnalysisInput): ReportV4MimoPageAnalysisInput {
  const context = input.context;
  if (!context || typeof context !== "object" || typeof context.pageId !== "string" || !context.pageId.trim() || (context.readability !== "direct_readable" && context.readability !== "js_dependent") || !/^https?:\/\//u.test(context.url) || !/^[a-f0-9]{64}$/u.test(context.contentHash) || context.sourceLength !== input.retainedText.length) {
    throw new TypeError("V4 page analysis context must match the retained source exactly.");
  }
  let url: string;
  try { url = new URL(context.url).href; } catch { throw new TypeError("V4 page analysis URL must be HTTP(S)."); }
  if (!/^https?:$/u.test(new URL(url).protocol)) throw new TypeError("V4 page analysis URL must be HTTP(S).");
  return Object.freeze({ context: { pageId: context.pageId.trim(), url, contentHash: context.contentHash, readability: context.readability, sourceLength: context.sourceLength }, retainedText: boundedText(input.retainedText) });
}

function canonicalWebsiteInput(input: ReportV4MimoWebsiteSynthesisInput): ReportV4MimoWebsiteSynthesisInput {
  const parsed = parseReportV4SiteSynthesisInput({ targetUrl: input.targetUrl, locale: input.locale, pages: input.pages });
  return Object.freeze({ targetUrl: parsed.targetUrl, locale: parsed.locale, pages: parsed.pages });
}

function pageInvocation(input: ReportV4MimoPageAnalysisInput, signal: AbortSignal): ReportV4MimoStructuredInvokeInput {
  return {
    operation: "pageAnalysis",
    systemText: PAGE_ANALYSIS_SYSTEM,
    inputText: JSON.stringify({
      context: input.context,
      evidenceSegments: evidenceSegments(input.retainedText).map(({ segmentId, text }) => ({ segmentId, text }))
    }),
    signal
  };
}

function websiteInvocation(input: ReportV4MimoWebsiteSynthesisInput, signal: AbortSignal): ReportV4MimoStructuredInvokeInput {
  return { operation: "websiteSynthesis", systemText: WEBSITE_SYNTHESIS_SYSTEM, inputText: JSON.stringify({ targetUrl: input.targetUrl, locale: input.locale, pages: input.pages }), signal };
}

const PAGE_ANALYSIS_SYSTEM =
  "Analyze only the supplied evidenceSegments for one page. Return exactly {\"chunks\":[{\"order\":number,\"summary\":string,\"evidenceSegmentIds\":[string]}]}. Return 1 to 8 chunks in order starting at 1. Every chunk must select 1 to 8 supplied segment IDs. Select each segment ID at most once in the entire response. Never calculate or return offsets, location IDs, sourceLocations, or any extra field. Do not use whole-site text, browse, correct, or retry.";

const WEBSITE_SYNTHESIS_SYSTEM =
  "Synthesize the website only from the supplied validated page summaries. Return exactly {\"summary\":string,\"strengths\":string[],\"gaps\":string[],\"actions\":string[]}. Use the requested locale; do not add fields, use raw HTML, browse, correct, or retry.";

function boundedText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Input text must be non-empty text.");
  }
  return value;
}

const EVIDENCE_SEGMENT_UTF16_LIMIT = 320;
const MODEL_OUTPUT_FIELDS = new Set(["chunks"]);
const MODEL_CHUNK_FIELDS = new Set(["order", "summary", "evidenceSegmentIds"]);

function evidenceSegments(retainedText: string): readonly ReportV4EvidenceSegment[] {
  const segments: ReportV4EvidenceSegment[] = [];
  let startOffset = 0;
  while (startOffset < retainedText.length) {
    let endOffset = Math.min(startOffset + EVIDENCE_SEGMENT_UTF16_LIMIT, retainedText.length);
    if (endOffset < retainedText.length && isHighSurrogate(retainedText.charCodeAt(endOffset - 1))
      && isLowSurrogate(retainedText.charCodeAt(endOffset))) {
      endOffset -= 1;
    }
    if (endOffset <= startOffset) throw new TypeError("V4 evidence segmentation did not advance through retained text.");
    segments.push(Object.freeze({
      segmentId: `segment-${segments.length + 1}`,
      text: retainedText.slice(startOffset, endOffset),
      startOffset,
      endOffset
    }));
    startOffset = endOffset;
  }
  return Object.freeze(segments);
}

function mapSegmentSelectionToSourceLocations(
  value: unknown,
  segments: readonly ReportV4EvidenceSegment[]
): unknown {
  const root = strictSelectionObject(value, "$pageAnalysisSelection", MODEL_OUTPUT_FIELDS);
  if (!Array.isArray(root.chunks) || root.chunks.length < 1 || root.chunks.length > 8) {
    throw new TypeError("$pageAnalysisSelection.chunks must contain between 1 and 8 chunks.");
  }
  const byId = new Map(segments.map((segment) => [segment.segmentId, segment]));
  const selected = new Set<string>();
  return {
    chunks: root.chunks.map((candidate, chunkIndex) => {
      const path = `$pageAnalysisSelection.chunks[${chunkIndex}]`;
      const chunk = strictSelectionObject(candidate, path, MODEL_CHUNK_FIELDS);
      if (chunk.order !== chunkIndex + 1) throw new TypeError(`${path}.order must match its one-based position.`);
      if (typeof chunk.summary !== "string" || !chunk.summary.trim()) throw new TypeError(`${path}.summary must be non-empty text.`);
      if (!Array.isArray(chunk.evidenceSegmentIds) || chunk.evidenceSegmentIds.length < 1 || chunk.evidenceSegmentIds.length > 8) {
        throw new TypeError(`${path}.evidenceSegmentIds must contain between 1 and 8 supplied segment IDs.`);
      }
      const sourceLocations = chunk.evidenceSegmentIds.map((candidateId, locationIndex) => {
        if (typeof candidateId !== "string" || !candidateId) throw new TypeError(`${path}.evidenceSegmentIds[${locationIndex}] must be text.`);
        const segment = byId.get(candidateId);
        if (!segment) throw new TypeError(`${path}.evidenceSegmentIds[${locationIndex}] references an unknown segment.`);
        if (selected.has(candidateId)) throw new TypeError(`${path}.evidenceSegmentIds[${locationIndex}] reuses a segment.`);
        selected.add(candidateId);
        return {
          locationId: `location-${chunkIndex + 1}-${locationIndex + 1}`,
          startOffset: segment.startOffset,
          endOffset: segment.endOffset
        };
      });
      return { order: chunkIndex + 1, summary: chunk.summary, sourceLocations };
    })
  };
}

function strictSelectionObject(value: unknown, path: string, fields: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (!fields.has(key)) throw new TypeError(`${path} contains unknown field ${key}.`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(row, field)) throw new TypeError(`${path}.${field} is required.`);
  }
  return row;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}
