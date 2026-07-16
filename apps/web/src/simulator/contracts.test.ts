import { describe, expect, it } from "vitest";
import {
  isSimulatorApiErrorResponse,
  isSimulatorMatchResponse,
  isSimulatorRunResponse
} from "./contracts";

describe("simulator API contracts", () => {
  it("accepts the canonical run response", () => {
    expect(
      isSimulatorRunResponse({
        runId: "run-1",
        sourceUrl: "https://example.com",
        generatedAt: "2026-07-10T00:00:00.000Z",
        attempted: [
          {
            id: "attempt-1",
            method: "GET",
            path: "/llms.txt",
            url: "https://example.com/llms.txt?ogc_run=run-1",
            userAgent: "GPTBot/1.0"
          }
        ]
      })
    ).toBe(true);
  });

  it("rejects legacy aliases and malformed run responses", () => {
    expect(isSimulatorRunResponse({ id: "run-1", attempts: [] })).toBe(false);
    expect(
      isSimulatorRunResponse({
        runId: "run-1",
        sourceUrl: "https://example.com",
        generatedAt: "2026-07-10T00:00:00.000Z",
        attempted: [{ id: "attempt-1", path: "/", userAgent: "GPTBot/1.0" }]
      })
    ).toBe(false);
  });

  it("accepts canonical match and error responses", () => {
    expect(
      isSimulatorMatchResponse({
        analysis: {},
        comparison: {
          runId: "run-1",
          attemptedCount: 1,
          observedCount: 1,
          signals: { parsedLines: 1, hasUserAgent: true, hasRunMarker: true },
          warnings: [],
          attempts: [{ attemptId: "attempt-1", matched: true, matches: [{ path: "/" }] }]
        }
      })
    ).toBe(true);
    expect(
      isSimulatorApiErrorResponse({ error: { code: "invalid_json", message: "Invalid JSON" } })
    ).toBe(true);
  });
});
