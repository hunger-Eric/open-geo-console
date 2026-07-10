import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeSimulatorLogs,
  readJsonRequest,
  runSimulator
} from "./simulator-api";

describe("simulator API log comparison", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the explicit simulator engine and returns the canonical API contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    const result = await runSimulator({ sourceUrl: "https://example.com/path#fragment" });

    expect(result).toMatchObject({
      sourceUrl: "https://example.com",
      runId: expect.any(String),
      generatedAt: expect.any(String)
    });
    expect(result.attempted.length).toBeGreaterThan(0);
    expect(result.attempted[0]).toMatchObject({
      id: expect.any(String),
      method: "GET",
      path: expect.any(String),
      userAgent: expect.any(String)
    });
  });

  it("reports malformed JSON with a stable input error code", async () => {
    const request = new Request("https://open-geo-console.local/api/simulator/runs", {
      body: "{",
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    await expect(readJsonRequest(request)).rejects.toMatchObject({ code: "invalid_json" });
  });

  it("compares attempted entries with observed logs by marker, path, and user agent", () => {
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [
        {
          id: "attempt-1",
          method: "GET",
          path: "/llms.txt",
          userAgent: "GPTBot/1.0"
        },
        {
          id: "attempt-2",
          method: "GET",
          path: "/pricing",
          userAgent: "ClaudeBot"
        }
      ],
      logInput: [
        '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt?ogc_run=run_123 HTTP/1.1" 200 12 "-" "GPTBot/1.0"'
      ].join("\n")
    });

    expect(result.analysis.aiCrawlerHits).toBe(1);
    expect(result.comparison.observedCount).toBe(1);
    expect(result.comparison.attempts[0]).toMatchObject({
      attemptId: "attempt-1",
      matched: true,
      matches: [expect.objectContaining({
        path: "/llms.txt?ogc_run=run_123",
        userAgent: "GPTBot/1.0"
      })]
    });
    expect(result.comparison.attempts[1]).toMatchObject({ attemptId: "attempt-2", matched: false });
  });

  it("counts observed attempts once when duplicate log lines match", () => {
    const line =
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt?ogc_run=run_123 HTTP/1.1" 200 12 "-" "GPTBot/1.0"';
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [{ id: "attempt-1", method: "GET", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
      logInput: [line, line].join("\n")
    });

    expect(result.comparison.attemptedCount).toBe(1);
    expect(result.comparison.observedCount).toBe(1);
    expect(result.comparison.attempts[0].matches).toHaveLength(2);
  });

  it("does not treat attempted entries as observed when logs are empty", () => {
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [{ id: "attempt-1", method: "GET", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
      logInput: ""
    });

    expect(result.analysis.aiCrawlerHits).toBe(0);
    expect(result.comparison.observedCount).toBe(0);
    expect(result.comparison.attempts).toEqual([
      expect.objectContaining({ attemptId: "attempt-1", matched: false })
    ]);
  });

  it("reports logs that lack User-Agent and ogc_run marker signals", () => {
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [{ id: "attempt-1", method: "GET", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
      logInput: JSON.stringify({
        EdgeStartTimestamp: "2026-07-08T01:02:03Z",
        ClientRequestPath: "/llms.txt",
        EdgeResponseStatus: 200
      })
    });

    expect(result.analysis.missingUserAgent).toBe(true);
    expect(result.comparison.signals).toMatchObject({
      parsedLines: 1,
      hasUserAgent: false,
      hasRunMarker: false
    });
    expect(result.comparison.warnings).toEqual(
      expect.arrayContaining(["missing_user_agent", "missing_ogc_run_marker"])
    );
    expect(result.comparison.attempts[0]).toMatchObject({ matched: false });
  });

  it("rejects malformed attempted entries instead of silently dropping them", () => {
    expect(() =>
      analyzeSimulatorLogs({
        runId: "run_123",
        attempted: [{ id: "attempt-1", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
        logInput: ""
      })
    ).toThrow("Every attempted entry must include id, method, path, and userAgent.");
  });
});
