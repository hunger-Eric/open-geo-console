import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { JsonCompletionClient } from "@open-geo-console/ai-report-engine";

export const PAID_V3_DIRECT_DEBUG_TRACE_PREFIX = "[paid-v3-direct-debug-v1]";

export interface PaidV3DirectDebugTraceDetails {
  phase?: string; configuredModel?: string; configuredMaxAttempts?: number; providerCallOrdinal?: number;
  providerCallCount?: number; pageCount?: number; batchCount?: number; citationCount?: number; uniqueUrlCount?: number;
  canonicalUrlHash?: string; registrableHost?: string; validator?: string; violationCount?: number; schemaPaths?: string[];
  errorName?: string; errorCode?: string; outcome?: string; artifactState?: string; fulfillmentState?: string; refundState?: string;
}

export interface PaidV3DirectDebugTrace {
  emit(kind: string, step: string, details?: PaidV3DirectDebugTraceDetails): void;
  span<T>(step: string, details: PaidV3DirectDebugTraceDetails, operation: () => Promise<T>): Promise<T>;
  wrapJsonClient(step: string, client: JsonCompletionClient, configuredMaxAttempts?: number): JsonCompletionClient;
}

const detailKeys = ["phase", "configuredModel", "configuredMaxAttempts", "providerCallOrdinal", "providerCallCount", "pageCount", "batchCount",
  "citationCount", "uniqueUrlCount", "canonicalUrlHash", "registrableHost", "validator", "violationCount", "schemaPaths",
  "errorName", "errorCode", "outcome", "artifactState", "fulfillmentState", "refundState"] as const;

export function createPaidV3DirectDebugTrace(input: {
  jobId: string; reportId: string; remainingMs: () => number; environment?: NodeJS.ProcessEnv; write?: (line: string) => void;
}): PaidV3DirectDebugTrace | null {
  if ((input.environment ?? process.env).OGC_PAID_V3_DEBUG_TRACE !== "1") return null;
  const write = input.write ?? ((line: string) => console.info(line));
  const emit = (kind: string, step: string, details: PaidV3DirectDebugTraceDetails = {}) => {
    write(`${PAID_V3_DIRECT_DEBUG_TRACE_PREFIX} ${JSON.stringify({
      schemaVersion: 1, recordedAt: new Date().toISOString(), kind, step, jobId: input.jobId, reportId: input.reportId,
      semanticValidation: "free_direct",
      remainingMs: Math.max(0, Math.trunc(input.remainingMs())),
      ...safeDetails(details)
    })}`);
  };
  return {
    emit,
    async span(step, details, operation) {
      const started = Date.now();
      emit("step_started", step, details);
      try {
        const value = await operation();
        emit("step_succeeded", step, { ...details, ...durationDetails(started) });
        return value;
      } catch (error) {
        emit("step_failed", step, { ...details, ...durationDetails(started), ...safeError(error) });
        throw error;
      }
    },
    wrapJsonClient(step, client, configuredMaxAttempts) {
      let ordinal = 0;
      return {
        configuredModel: client.configuredModel,
        async completeJson(request) {
          ordinal += 1;
          const details = { configuredModel: client.configuredModel, configuredMaxAttempts, providerCallOrdinal: ordinal };
          const started = Date.now();
          emit("provider_call_started", step, details);
          try {
            const result = await client.completeJson(request);
            emit("provider_call_succeeded", step, { ...details, ...durationDetails(started) });
            return result;
          } catch (error) {
            emit("provider_call_failed", step, { ...details, ...durationDetails(started), ...safeError(error) });
            throw error;
          }
        }
      };
    }
  };
}

export function paidV3TraceUrlIdentity(value: string): Pick<PaidV3DirectDebugTraceDetails, "canonicalUrlHash" | "registrableHost"> {
  try {
    const url = new URL(value);
    url.hash = "";
    const host = url.hostname.toLocaleLowerCase();
    return { canonicalUrlHash: createHash("sha256").update(url.href).digest("hex"), registrableHost: isIP(host.replace(/^\[|\]$/g, "")) ? "ip-host" : host };
  } catch {
    return { canonicalUrlHash: createHash("sha256").update(value).digest("hex"), registrableHost: "invalid-url" };
  }
}

export function tracePaidV3DirectStep<T>(trace: PaidV3DirectDebugTrace | null | undefined, step: string,
  details: PaidV3DirectDebugTraceDetails, operation: () => Promise<T>): Promise<T> {
  return trace ? trace.span(step, details, operation) : operation();
}

function durationDetails(started: number): { durationMs: number } {
  return { durationMs: Math.max(0, Date.now() - started) };
}

function safeError(error: unknown): Pick<PaidV3DirectDebugTraceDetails, "errorName" | "errorCode" | "violationCount" | "schemaPaths"> {
  const row = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const rawPaths = [row.issues, row.violations].flatMap((value) => Array.isArray(value) ? value : [])
    .map((value) => value && typeof value === "object" ? (value as Record<string, unknown>).path : undefined)
    .filter((value): value is string => typeof value === "string" && /^\$?[\w.\[\]-]{1,200}$/.test(value));
  const code = typeof row.code === "string" && /^[a-z0-9_:-]{1,80}$/i.test(row.code) ? row.code : undefined;
  return { errorName: error instanceof Error ? error.name : "UnknownError", ...(code ? { errorCode: code } : {}),
    ...(rawPaths.length ? { violationCount: rawPaths.length, schemaPaths: [...new Set(rawPaths)].slice(0, 24) } : {}) };
}

function safeDetails(details: PaidV3DirectDebugTraceDetails & { durationMs?: number }): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of detailKeys) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) output[key] = Math.max(0, Math.trunc(value));
    else if (typeof value === "string" && /^[\w.:/-]{1,200}$/i.test(value)) output[key] = value;
    else if (Array.isArray(value)) {
      const paths = value.filter((path) => /^\$?[\w.\[\]-]{1,200}$/.test(path)).slice(0, 24);
      if (paths.length) output[key] = paths;
    }
  }
  if (typeof details.durationMs === "number") output.durationMs = Math.max(0, Math.trunc(details.durationMs));
  return output;
}
