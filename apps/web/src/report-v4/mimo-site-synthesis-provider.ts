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
  type ReportV4MimoStructuredInvokeInput
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
  return Object.freeze({
    async analyzePage(input: ReportV4MimoPageAnalysisInput, signal: AbortSignal) {
      const canonical = canonicalPageInput(input);
      const value = await invoker.invoke(pageInvocation(canonical, signal));
      return parseReportV4PageAnalysisOutput(value, canonical.context);
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
  return { operation: "pageAnalysis", systemText: PAGE_ANALYSIS_SYSTEM, inputText: JSON.stringify({ context: input.context, retainedText: input.retainedText }), signal };
}

function websiteInvocation(input: ReportV4MimoWebsiteSynthesisInput, signal: AbortSignal): ReportV4MimoStructuredInvokeInput {
  return { operation: "websiteSynthesis", systemText: WEBSITE_SYNTHESIS_SYSTEM, inputText: JSON.stringify({ targetUrl: input.targetUrl, locale: input.locale, pages: input.pages }), signal };
}

const PAGE_ANALYSIS_SYSTEM =
  "Analyze only the supplied retained text for one page. Return exactly {\"chunks\":[{\"order\":number,\"summary\":string,\"sourceLocations\":[{\"locationId\":string,\"startOffset\":number,\"endOffset\":number}]}]}. Preserve exact source locations within the retained source; do not add fields, use whole-site text, browse, or retry.";

const WEBSITE_SYNTHESIS_SYSTEM =
  "Synthesize the website only from the supplied validated page summaries. Return exactly {\"summary\":string,\"strengths\":string[],\"gaps\":string[],\"actions\":string[]}. Use the requested locale; do not add fields, use raw HTML, browse, correct, or retry.";

function boundedText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Input text must be non-empty text.");
  }
  return value;
}
