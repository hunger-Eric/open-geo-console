import { matchUserAgent } from "@open-geo-console/crawler-rules";
import { describe, expect, it, vi } from "vitest";
import { analyzeSimulatorLogs } from "@/app/api/simulator/_lib/simulator-api";
import { getDictionary } from "@/i18n";
import { runExternalCrawlerSimulation, selectSimulatorBotProfiles } from ".";

function nginxLine(path: string, userAgent: string): string {
  return `203.0.113.10 - - [08/Jul/2026:09:10:11 +0800] "GET ${path} HTTP/1.1" 200 12 "-" "${userAgent}"`;
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("external AI crawler simulator evidence contract", () => {
  it("does not include robots-token-only bots as HTTP User-Agent visits", async () => {
    const profiles = selectSimulatorBotProfiles([
      "openai-gptbot",
      "google-extended",
      "apple-applebot-extended"
    ]);

    expect(profiles.map((profile) => profile.bot)).toEqual(["GPTBot"]);
    expect(selectSimulatorBotProfiles(["google-extended", "apple-applebot-extended"])).toEqual([]);

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return new Response("", { status: headers.has("User-Agent") ? 200 : 404 });
    });
    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com",
      runId: "ogc_test_policy_tokens",
      botRuleIds: ["openai-gptbot", "google-extended", "apple-applebot-extended"],
      maxPaths: 1,
      maxRequests: 3,
      fetchImpl
    });

    expect(run.attempted).toHaveLength(1);
    expect(run.attempted.map((attempt) => attempt.bot)).not.toContain("Google-Extended");
    expect(run.attempted.map((attempt) => attempt.bot)).not.toContain("Applebot-Extended");
    expect(run.attempted[0].userAgent).toContain("GPTBot");
    expect(matchUserAgent(run.attempted[0].userAgent)).toEqual(
      expect.objectContaining({ bot: "GPTBot", detectability: "log-detectable" })
    );
  });

  it("matches imported logs with ogc_run=<runId> as observed simulator evidence", () => {
    const result = analyzeSimulatorLogs({
      runId: "ogc_test_observed",
      attempted: [
        {
          id: "attempt-gptbot",
          method: "GET",
          path: "/llms.txt",
          userAgent: "GPTBot/1.0"
        }
      ],
      logInput: nginxLine("/llms.txt?ogc_run=ogc_test_observed", "GPTBot/1.0")
    });

    expect(result.analysis.aiCrawlerHits).toBe(1);
    expect(result.comparison.observedMatchCount).toBe(1);
    expect(result.comparison.observedMatches[0]).toMatchObject({
      attemptId: "attempt-gptbot",
      path: "/llms.txt?ogc_run=ogc_test_observed",
      userAgent: "GPTBot/1.0",
      matchReasons: expect.arrayContaining(["ogc_run", "path", "user_agent"])
    });
    expect(result.comparison.missingAttempted).toEqual([]);
  });

  it("keeps matching logs without the run marker attempted but not observed", () => {
    const result = analyzeSimulatorLogs({
      runId: "ogc_test_attempted_only",
      attempted: [
        {
          id: "attempt-claudebot",
          method: "GET",
          path: "/llms.txt",
          userAgent: "ClaudeBot/1.0"
        }
      ],
      logInput: nginxLine("/llms.txt", "ClaudeBot/1.0")
    });

    expect(result.analysis.aiCrawlerHits).toBe(1);
    expect(result.comparison.signals.hasRunMarker).toBe(false);
    expect(result.comparison.warnings).toEqual(expect.arrayContaining(["missing_ogc_run_marker"]));
    expect(result.comparison.observedMatchCount).toBe(0);
    expect(result.comparison.observedMatches).toEqual([]);
    expect(result.comparison.missingAttempted).toEqual([
      expect.objectContaining({
        attemptId: "attempt-claudebot",
        reasons: expect.arrayContaining(["no_ogc_run_marker_observed"])
      })
    ]);
  });

  it("does not count an ordinary browser User-Agent as an observed AI bot", () => {
    const result = analyzeSimulatorLogs({
      runId: "ogc_test_browser_ua",
      attempted: [
        {
          id: "attempt-gptbot",
          method: "GET",
          path: "/pricing",
          userAgent: "GPTBot/1.0"
        }
      ],
      logInput: nginxLine(
        "/pricing?ogc_run=ogc_test_browser_ua",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
      )
    });

    expect(result.analysis.aiCrawlerHits).toBe(0);
    expect(result.comparison.signals.hasRunMarker).toBe(true);
    expect(result.comparison.observedMatchCount).toBe(0);
    expect(result.comparison.observedMatches).toEqual([]);
    expect(result.comparison.missingAttempted).toEqual([
      expect.objectContaining({ attemptId: "attempt-gptbot" })
    ]);
  });

  it("keeps simulator copy in i18n parity", () => {
    const english = getDictionary("en").logs.simulator;
    const chinese = getDictionary("zh").logs.simulator;

    expect(flattenKeys(chinese)).toEqual(flattenKeys(english));
    expect(english).toEqual(
      expect.objectContaining({
        title: expect.any(String),
        description: expect.any(String),
        attemptedTitle: expect.any(String),
        attemptedDescription: expect.stringMatching(/not proof/i),
        comparisonTitle: expect.any(String),
        comparisonDescription: expect.stringMatching(/logs/i),
        observedTitle: expect.any(String),
        observedBadge: expect.any(String),
        missingBadge: expect.any(String)
      })
    );
  });
});
