import { describe, expect, it } from "vitest";
import {
  analyzeLogs,
  buildBotEvidenceSummary,
  parseCloudflareJsonLine,
  parseNginxCombinedLine
} from "./index";

describe("log parser", () => {
  it("parses Nginx combined lines and aggregates AI crawler hits", () => {
    const input = [
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt HTTP/1.1" 200 12 "-" "GPTBot/1.0"',
      '203.0.113.2 - - [08/Jul/2026:09:11:11 +0800] "GET /about HTTP/1.1" 200 12 "-" "Claude-SearchBot"',
      "bad line"
    ].join("\n");

    const result = analyzeLogs(input);
    expect(result.totalLines).toBe(3);
    expect(result.parsedLines).toBe(2);
    expect(result.aiCrawlerHits).toBe(2);
    expect(result.visits[0]?.timestamp).toBe("2026-07-08T01:10:11.000Z");
    expect(result.aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: "OpenAI", bot: "GPTBot", path: "/llms.txt" }),
        expect.objectContaining({ operator: "Anthropic", bot: "Claude-SearchBot", path: "/about" })
      ])
    );
    expect(result.botCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "openai-gptbot",
          operator: "OpenAI",
          bot: "GPTBot",
          status: "detected",
          hits: 1,
          docsUrl: expect.any(String),
          robotsToken: "GPTBot"
        }),
        expect.objectContaining({
          ruleId: "google-extended",
          bot: "Google-Extended",
          status: "not_log_detectable",
          hits: 0
        }),
        expect.objectContaining({
          ruleId: "apple-applebot-extended",
          bot: "Applebot-Extended",
          status: "not_log_detectable",
          hits: 0
        })
      ])
    );
  });

  it("parses Cloudflare JSONL", () => {
    const line = JSON.stringify({
      EdgeStartTimestamp: "2026-07-08T01:02:03Z",
      ClientRequestMethod: "GET",
      ClientRequestPath: "/",
      EdgeResponseStatus: 200,
      ClientRequestUserAgent: "Bytespider"
    });

    expect(parseCloudflareJsonLine(line)).toMatchObject({
      path: "/",
      status: 200,
      userAgent: "Bytespider",
      source: "cloudflare"
    });
  });

  it("builds coverage from Cloudflare JSONL", () => {
    const input = [
      JSON.stringify({
        EdgeStartTimestamp: "2026-07-08T01:02:03Z",
        ClientRequestMethod: "GET",
        ClientRequestPath: "/pricing",
        EdgeResponseStatus: 200,
        ClientRequestUserAgent: "PerplexityBot/1.0"
      }),
      JSON.stringify({
        EdgeStartTimestamp: "2026-07-08T01:03:03Z",
        ClientRequestMethod: "GET",
        ClientRequestPath: "/",
        EdgeResponseStatus: 200,
        ClientRequestUserAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36"
      })
    ].join("\n");

    const result = analyzeLogs(input);

    expect(result.aiCrawlerHits).toBe(1);
    expect(result.botCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "perplexity-perplexitybot",
          operator: "Perplexity",
          bot: "PerplexityBot",
          status: "detected",
          hits: 1,
          paths: ["/pricing"]
        })
      ])
    );
  });

  it("reports missing user agent logs clearly", () => {
    const result = analyzeLogs(
      JSON.stringify({
        EdgeStartTimestamp: "2026-07-08T01:02:03Z",
        ClientRequestPath: "/",
        EdgeResponseStatus: 200
      })
    );

    expect(result.missingUserAgent).toBe(true);
    expect(result.warning).toContain("cannot be reconstructed");
    expect(result.aiCrawlerHits).toBe(0);
    expect(result.botCoverage.every((row) => row.status !== "detected")).toBe(true);
    expect(result.policyHints).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "logging-user-agent" })])
    );
  });

  it("aggregates multi-operator AI crawler visibility", () => {
    const input = [
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /llms.txt HTTP/1.1" 200 12 "-" "GPTBot/1.0"',
      '203.0.113.2 - - [08/Jul/2026:09:11:11 +0800] "GET /about HTTP/1.1" 200 12 "-" "ClaudeBot"',
      '203.0.113.3 - - [08/Jul/2026:09:12:11 +0800] "GET /pricing HTTP/1.1" 200 12 "-" "PerplexityBot"',
      '203.0.113.4 - - [08/Jul/2026:09:13:11 +0800] "GET /blog HTTP/1.1" 200 12 "-" "Bytespider"',
      '203.0.113.5 - - [08/Jul/2026:09:14:11 +0800] "GET /case HTTP/1.1" 200 12 "-" "CCBot/2.0"',
      '203.0.113.6 - - [08/Jul/2026:09:15:11 +0800] "GET / HTTP/1.1" 200 12 "-" "Mozilla/5.0 Chrome/125"'
    ].join("\n");

    const result = analyzeLogs(input);

    expect(result.aiCrawlerHits).toBe(5);
    expect(result.operatorSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: "OpenAI", detectedBots: ["GPTBot"], totalHits: 1 }),
        expect.objectContaining({ operator: "Anthropic", detectedBots: ["ClaudeBot"], totalHits: 1 }),
        expect.objectContaining({
          operator: "Perplexity",
          detectedBots: ["PerplexityBot"],
          totalHits: 1
        }),
        expect.objectContaining({ operator: "ByteDance", detectedBots: ["Bytespider"], totalHits: 1 }),
        expect.objectContaining({ operator: "Common Crawl", detectedBots: ["CCBot"], totalHits: 1 })
      ])
    );
    expect(result.botCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "bytedance-bytespider", status: "detected", hits: 1 }),
        expect.objectContaining({ ruleId: "common-crawl-ccbot", status: "detected", hits: 1 })
      ])
    );
  });

  it("does not count robots-token-only or ordinary browser user agents as hits", () => {
    const input = [
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET / HTTP/1.1" 200 12 "-" "Google-Extended"',
      '203.0.113.2 - - [08/Jul/2026:09:11:11 +0800] "GET / HTTP/1.1" 200 12 "-" "Applebot-Extended"',
      '203.0.113.3 - - [08/Jul/2026:09:12:11 +0800] "GET / HTTP/1.1" 200 12 "-" "Mozilla/5.0 Chrome/125"'
    ].join("\n");

    const result = analyzeLogs(input);

    expect(result.aiCrawlerHits).toBe(0);
    expect(result.visits).toEqual([]);
    expect(result.botCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "google-extended", status: "not_log_detectable", hits: 0 }),
        expect.objectContaining({
          ruleId: "apple-applebot-extended",
          status: "not_log_detectable",
          hits: 0
        })
      ])
    );
  });

  it("marks unseen suspected or community rules separately from not seen official rules", () => {
    const result = analyzeLogs(
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET / HTTP/1.1" 200 12 "-" "GPTBot/1.0"'
    );

    expect(result.botCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "bytedance-bytespider",
          status: "unknown_or_unverified"
        }),
        expect.objectContaining({
          ruleId: "google-googlebot",
          status: "not_seen"
        })
      ])
    );
  });

  it("rejects malformed Nginx lines", () => {
    expect(parseNginxCombinedLine("not an access log")).toBeNull();
  });

  it("builds a deterministic, share-safe bot evidence summary", () => {
    const input = [
      '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /private/path HTTP/1.1" 200 12 "-" "GPTBot/1.0"',
      '203.0.113.2 - - [08/Jul/2026:09:11:11 +0800] "GET /about HTTP/1.1" 200 12 "-" "ClaudeBot"'
    ].join("\n");

    const summary = buildBotEvidenceSummary(
      analyzeLogs(input),
      "2026-07-10T00:00:00.000Z"
    );

    expect(summary).toMatchObject({
      analysisVersion: 1,
      analyzedAt: "2026-07-10T00:00:00.000Z",
      totalLines: 2,
      parsedLines: 2,
      aiCrawlerHits: 2,
      detectedBotCount: 2
    });
    expect(summary.bots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "openai-gptbot", hits: 1 }),
        expect.objectContaining({ ruleId: "anthropic-claudebot", hits: 1 })
      ])
    );
    expect(JSON.stringify(summary)).not.toContain("203.0.113");
    expect(JSON.stringify(summary)).not.toContain("/private/path");
    expect(JSON.stringify(summary)).not.toContain("GPTBot/1.0");
  });
});
