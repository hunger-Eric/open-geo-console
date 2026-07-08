import { describe, expect, it } from "vitest";
import { analyzeSimulatorLogs } from "./simulator-api";

describe("simulator API log comparison", () => {
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
    expect(result.comparison.observedMatchCount).toBe(1);
    expect(result.comparison.observedMatches[0]).toMatchObject({
      attemptId: "attempt-1",
      path: "/llms.txt?ogc_run=run_123",
      userAgent: "GPTBot/1.0",
      matchReasons: expect.arrayContaining(["ogc_run", "path", "user_agent"])
    });
    expect(result.comparison.missingAttempted).toEqual([
      expect.objectContaining({ attemptId: "attempt-2" })
    ]);
  });

  it("does not treat attempted entries as observed when logs are empty", () => {
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [{ id: "attempt-1", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
      logInput: ""
    });

    expect(result.analysis.aiCrawlerHits).toBe(0);
    expect(result.comparison.observedMatchCount).toBe(0);
    expect(result.comparison.missingAttempted).toHaveLength(1);
  });

  it("reports logs that lack User-Agent and ogc_run marker signals", () => {
    const result = analyzeSimulatorLogs({
      runId: "run_123",
      attempted: [{ id: "attempt-1", path: "/llms.txt", userAgent: "GPTBot/1.0" }],
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
    expect(result.comparison.missingAttempted[0].reasons).toEqual(
      expect.arrayContaining(["no_user_agent_observed", "no_ogc_run_marker_observed"])
    );
  });
});
