import { describe, expect, it, vi } from "vitest";
import { AiClientError } from "@open-geo-console/ai-report-engine";
import {
  PAID_V3_DIRECT_DEBUG_TRACE_PREFIX,
  createPaidV3DirectDebugTrace,
  paidV3TraceUrlIdentity,
  tracePaidV3DirectStep
} from "./paid-v3-direct-debug-trace";

describe("Paid V3 Direct debug trace", () => {
  it.each([undefined, "", "0", "true", "01", "debug"])("is silent unless the switch is exact 1 (%s)", async (value) => {
    const write = vi.fn();
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1",
      reportId: "report-1",
      remainingMs: () => 900_000,
      environment: { OGC_PAID_V3_DEBUG_TRACE: value },
      write
    });
    const expected = { exact: true };
    const result = await tracePaidV3DirectStep(trace, "website_synthesis", {}, async () => expected);
    expect(trace).toBeNull();
    expect(result).toBe(expected);
    expect(write).not.toHaveBeenCalled();
  });

  it("counts only actual provider calls and preserves exact values and errors", async () => {
    const lines: string[] = [];
    let remainingMs = 800_000;
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1",
      reportId: "report-1",
      remainingMs: () => remainingMs,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" },
      write: (line) => lines.push(line)
    })!;
    const value = { answer: 42 };
    const completeJson = vi.fn(async () => value as never);
    const client = trace.wrapJsonClient("website_synthesis_provider_call", {
      configuredModel: "safe-model",
      completeJson
    }, 1);
    const request = { messages: [{ role: "user" as const, content: "SECRET_PROMPT" }] };

    expect(await client.completeJson(request)).toBe(value);
    expect(await client.completeJson(request)).toBe(value);
    expect(completeJson).toHaveBeenCalledTimes(2);
    remainingMs = 700_000;
    const original = new Error("SECRET_ERROR_TEXT");
    await expect(trace.span("ai_report_persist", { phase: "website_synthesis" }, async () => { throw original; }))
      .rejects.toBe(original);

    const events = lines.map(parseLine);
    expect(events.filter(({ kind }) => kind === "provider_call_started")).toHaveLength(2);
    expect(events.filter(({ kind }) => kind === "provider_call_succeeded")).toHaveLength(2);
    expect(events.filter(({ kind }) => kind === "provider_call_started").map(({ providerCallOrdinal }) => providerCallOrdinal)).toEqual([1, 2]);
    expect(events.find(({ kind }) => kind === "step_failed")).toMatchObject({
      jobId: "job-1", reportId: "report-1", step: "ai_report_persist",
      phase: "website_synthesis", errorName: "Error", remainingMs: 700_000
    });
    expect(lines.join("\n")).not.toContain("SECRET_PROMPT");
    expect(lines.join("\n")).not.toContain("SECRET_ERROR_TEXT");
  });

  it("emits only allowlisted fields and hashes full URLs", () => {
    const lines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 1,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => lines.push(line)
    })!;
    const url = "https://public.example/path?access_token=SECRET_URL_TOKEN#fragment";
    trace.emit("gate_result", "provider_claim_validation", {
      phase: "provider_claim_extraction",
      validator: "validateProviderClaimCandidate",
      schemaPaths: ["$.claims[0].exactExcerpt", "SECRET PATH WITH SPACES"],
      ...paidV3TraceUrlIdentity(url),
      rawPrompt: "SECRET_MODEL_TEXT"
    } as never);

    const event = parseLine(lines[0]!);
    expect(event).toMatchObject({
      schemaVersion: 1, registrableHost: "public.example",
      validator: "validateProviderClaimCandidate",
      schemaPaths: ["$.claims[0].exactExcerpt"]
    });
    expect(event).not.toHaveProperty("rawPrompt");
    expect(lines[0]).not.toContain(url);
    expect(lines[0]).not.toContain("SECRET_URL_TOKEN");
    expect(lines[0]).not.toContain("SECRET_MODEL_TEXT");
    expect(paidV3TraceUrlIdentity("https://192.0.2.10/private").registrableHost).toBe("ip-host");
    expect(paidV3TraceUrlIdentity("https://[2001:db8::1]/private").registrableHost).toBe("ip-host");
  });

  it("emits safe provider metadata through a wrapped batch error without content", async () => {
    const lines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 1,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => lines.push(line)
    })!;
    const provider = new AiClientError("SENTINEL_MODEL_PROSE", {
      code: "output_truncated", status: 200, finishReason: "length", responseChars: 4321, outputTokens: 8000
    });
    const batch = new Error("SENTINEL_BATCH_MESSAGE", { cause: provider });
    batch.name = "PageAnalysisBatchError";

    await expect(trace.span("page_analysis", { phase: "page_analysis" }, async () => { throw batch; })).rejects.toBe(batch);

    const event = lines.map(parseLine).find(({ kind }) => kind === "step_failed");
    expect(event).toMatchObject({
      errorName: "PageAnalysisBatchError", errorCode: "output_truncated", providerStatus: 200,
      finishReason: "length", responseChars: 4321, outputTokens: 8000
    });
    expect(lines.join("\n")).not.toContain("SENTINEL_MODEL_PROSE");
    expect(lines.join("\n")).not.toContain("SENTINEL_BATCH_MESSAGE");
  });

  it("records safe stage dispositions without letting a broken writer alter the job", async () => {
    const lines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 1,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => lines.push(line)
    })!;
    const error = new AiClientError("SENTINEL_PROVIDER_MESSAGE", { code: "provider_timeout", status: 504 });

    trace.degraded("visual_evidence_summary", {
      phase: "visual_evidence", progress: 90, completedCount: 2, degradedCount: 1,
      disposition: "continued_without_visual_evidence"
    }, error);
    trace.failed("answer_checkpoint_persist", {
      phase: "answer_collection", checkpointRevision: 7, resumeGeneration: 2
    }, error);

    expect(lines.map(parseLine)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "step_degraded", step: "visual_evidence_summary", progress: 90,
        completedCount: 2, degradedCount: 1, disposition: "continued_without_visual_evidence",
        errorCode: "provider_timeout", providerStatus: 504
      }),
      expect.objectContaining({
        kind: "step_failed", step: "answer_checkpoint_persist", checkpointRevision: 7,
        resumeGeneration: 2, errorCode: "provider_timeout"
      })
    ]));
    expect(lines.join("\n")).not.toContain("SENTINEL_PROVIDER_MESSAGE");

    const value = { preserved: true };
    const brokenTrace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 1,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: () => { throw new Error("WRITER_FAILURE"); }
    })!;
    expect(await brokenTrace.span("safe_observer", {}, async () => value)).toBe(value);
    await expect(brokenTrace.span("safe_observer", {}, async () => { throw error; })).rejects.toBe(error);
    expect(() => brokenTrace.degraded("safe_observer", {}, error)).not.toThrow();
  });

  it("rejects secret-shaped error names and codes", async () => {
    const lines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 1,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => lines.push(line)
    })!;
    const error = new Error("not logged") as Error & { code: string };
    error.name = "sk-live-secret";
    error.code = "api_key_secret_value";

    await expect(trace.span("secret_shaped_error", {}, async () => { throw error; })).rejects.toBe(error);

    const event = lines.map(parseLine).find(({ kind }) => kind === "step_failed")!;
    expect(event.errorName).toBe("UnknownError");
    expect(event).not.toHaveProperty("errorCode");
    expect(lines.join("\n")).not.toMatch(/sk-live|api_key|secret_value/i);
  });
});

function parseLine(line: string): Record<string, unknown> {
  expect(line.startsWith(`${PAID_V3_DIRECT_DEBUG_TRACE_PREFIX} `)).toBe(true);
  return JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as Record<string, unknown>;
}
