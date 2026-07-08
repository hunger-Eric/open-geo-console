import { describe, expect, it } from "vitest";
import { analyzeLogs, parseCloudflareJsonLine, parseNginxCombinedLine } from "./index";

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
    expect(result.aggregates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: "OpenAI", bot: "GPTBot", path: "/llms.txt" }),
        expect.objectContaining({ operator: "Anthropic", bot: "Claude-SearchBot", path: "/about" })
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
  });

  it("rejects malformed Nginx lines", () => {
    expect(parseNginxCombinedLine("not an access log")).toBeNull();
  });
});
