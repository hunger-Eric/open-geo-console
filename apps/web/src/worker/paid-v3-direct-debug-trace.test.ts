import { describe, expect, it, vi } from "vitest";
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
});

function parseLine(line: string): Record<string, unknown> {
  expect(line.startsWith(`${PAID_V3_DIRECT_DEBUG_TRACE_PREFIX} `)).toBe(true);
  return JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as Record<string, unknown>;
}
