import { deterministicId } from "./identity";
import { assertAdapterAuthority } from "./registry";
import type { MarketSearchObservation, ObservePublicSearchInput, SearchAdapterErrorClass } from "./types";
import { parseMarketSearchObservation, parseSearchExecutionBudget } from "./validation";

export async function observePublicSearch(input: ObservePublicSearchInput): Promise<MarketSearchObservation> {
  const budget = parseSearchExecutionBudget(input.budget);
  assertAdapterAuthority(input.adapter);
  const requestedAt = new Date().toISOString();
  if (input.signal.aborted) return terminal(input, requestedAt, "aborted", "The caller cancelled the public-search request.");
  const controller = new AbortController();
  let rejectCallerAbort: ((error: Error) => void) | undefined;
  const callerAbort = new Promise<never>((_, reject) => { rejectCallerAbort = reject; });
  const propagateAbort = () => { rejectCallerAbort?.(new CallerAbortError()); controller.abort(); };
  input.signal.addEventListener("abort", propagateAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      input.adapter.search({ surface: input.adapter.surface, query: input.query, budget, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new SearchTimeoutError()); controller.abort(); }, budget.timeoutMs);
      }),
      callerAbort
    ]);
    let parsed: MarketSearchObservation;
    try {
      parsed = parseMarketSearchObservation(raw);
    } catch {
      return terminal(input, requestedAt, "malformed", "The public-search surface returned an invalid response.");
    }
    if (parsed.surface.surfaceId !== input.adapter.surface.surfaceId || parsed.surface.surfaceVersion !== input.adapter.surface.surfaceVersion ||
        parsed.queryId !== input.query.id || parsed.exactQuery !== input.query.exactQuery) {
      return terminal(input, requestedAt, "malformed", "The adapter response did not match the requested search identity.");
    }
    if (parsed.usage.requestCount > budget.maxRequests || parsed.results.length > Math.min(budget.maxResults, input.query.resultDepth) ||
        (parsed.usage.estimatedCostMicros ?? 0) > budget.maxCostMicros || (parsed.usage.providerReportedCostMicros ?? 0) > budget.maxCostMicros) {
      return terminal(input, requestedAt, "malformed", "The adapter response exceeded its execution budget.", parsed.usage);
    }
    return parsed;
  } catch (error) {
    if (input.signal.aborted) return terminal(input, requestedAt, "aborted", "The caller cancelled the public-search request.", { requestCount: 1, resultCount: 0, costUncertain: true });
    const status: SearchAdapterErrorClass = error instanceof SearchTimeoutError ? "timed_out" : safeClassification(input, error);
    return terminal(input, requestedAt, status, safeMessage(status));
  } finally {
    if (timer) clearTimeout(timer);
    input.signal.removeEventListener("abort", propagateAbort);
  }
}

function terminal(
  input: ObservePublicSearchInput,
  requestedAt: string,
  status: SearchAdapterErrorClass,
  sanitizedError: string,
  reportedUsage?: MarketSearchObservation["usage"]
): MarketSearchObservation {
  const completedAt = new Date().toISOString();
  return parseMarketSearchObservation({
    observationId: deterministicId("observation", [input.adapter.surface.surfaceId, input.adapter.surface.surfaceVersion, input.query.id, requestedAt, status]),
    surface: input.adapter.surface, queryId: input.query.id, exactQuery: input.query.exactQuery,
    requestedAt, completedAt, status, results: [], usage: {
      requestCount: reportedUsage?.requestCount ?? (status === "aborted" ? 0 : 1),
      resultCount: 0,
      ...(reportedUsage?.estimatedCostMicros === undefined ? {} : { estimatedCostMicros: reportedUsage.estimatedCostMicros }),
      ...(reportedUsage?.providerReportedCostMicros === undefined ? {} : { providerReportedCostMicros: reportedUsage.providerReportedCostMicros }),
      costUncertain: reportedUsage?.costUncertain ?? status !== "aborted"
    }, sanitizedError
  });
}

function safeClassification(input: ObservePublicSearchInput, error: unknown): SearchAdapterErrorClass {
  try {
    const classified = input.adapter.classifyError?.(error) ?? "unavailable";
    return (["rate_limited", "timed_out", "unavailable", "malformed", "aborted"] as const).includes(classified)
      ? classified
      : "unavailable";
  } catch {
    return "unavailable";
  }
}

function safeMessage(status: SearchAdapterErrorClass): string {
  const messages: Record<SearchAdapterErrorClass, string> = {
    rate_limited: "The public-search surface rate limit prevented this observation.",
    timed_out: "The public-search request timed out; cost may be uncertain.",
    unavailable: "The public-search surface was unavailable.",
    malformed: "The public-search surface returned an invalid response.",
    aborted: "The caller cancelled the public-search request."
  };
  return messages[status];
}

class SearchTimeoutError extends Error {}
class CallerAbortError extends Error {}
