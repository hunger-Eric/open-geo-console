import { describe, expect, it } from "vitest";
import {
  crawlerRules,
  isKnownAiCrawler,
  matchUserAgent,
  robotsTokenOnlyCrawlerRules
} from "./index";

describe("matchUserAgent", () => {
  it.each([
    ["GPTBot", "OpenAI", "GPTBot", "log-detectable"],
    ["OAI-SearchBot/1.0", "OpenAI", "OAI-SearchBot", "log-detectable"],
    ["ChatGPT-User", "OpenAI", "ChatGPT-User", "log-detectable"],
    ["ClaudeBot", "Anthropic", "ClaudeBot", "log-detectable"],
    ["Claude-User", "Anthropic", "Claude-User", "log-detectable"],
    ["Claude-SearchBot", "Anthropic", "Claude-SearchBot", "log-detectable"],
    ["PerplexityBot/1.0", "Perplexity", "PerplexityBot", "log-detectable"],
    ["Perplexity-User/1.0", "Perplexity", "Perplexity-User", "log-detectable"],
    ["Googlebot/2.1", "Google", "Googlebot", "log-detectable"],
    ["GoogleOther", "Google", "GoogleOther", "log-detectable"],
    ["bingbot/2.0", "Microsoft", "Bingbot", "log-detectable"],
    ["msnbot", "Microsoft", "Microsoft Copilot", "suspected-or-community"],
    ["Microsoft-Copilot", "Microsoft", "Microsoft Copilot", "suspected-or-community"],
    ["Meta-ExternalAgent", "Meta", "Meta-ExternalAgent", "log-detectable"],
    ["Bytespider", "ByteDance", "Bytespider", "suspected-or-community"],
    ["Amazonbot/0.1", "Amazon", "Amazonbot", "log-detectable"],
    ["Applebot", "Apple", "Applebot", "log-detectable"],
    ["CCBot/2.0", "Common Crawl", "CCBot", "log-detectable"]
  ])("matches %s", (userAgent, operator, bot, detectability) => {
    expect(matchUserAgent(userAgent)).toMatchObject({ operator, bot, detectability });
  });

  it("ignores empty or unknown user agents", () => {
    expect(matchUserAgent("-")).toBeNull();
    expect(matchUserAgent("Mozilla/5.0")).toBeNull();
    expect(isKnownAiCrawler("Mozilla/5.0")).toBe(false);
  });

  it("does not treat robots-token-only policy tokens as log hits", () => {
    expect(matchUserAgent("Google-Extended")).toBeNull();
    expect(matchUserAgent("Applebot-Extended")).toBeNull();
    expect(isKnownAiCrawler("Google-Extended")).toBe(false);
    expect(isKnownAiCrawler("Applebot-Extended")).toBe(false);
  });

  it("keeps robots-token-only entries in the registry for policy display", () => {
    expect(robotsTokenOnlyCrawlerRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bot: "Google-Extended",
          detectability: "robots-token-only",
          robotsToken: "Google-Extended"
        }),
        expect.objectContaining({
          bot: "Applebot-Extended",
          detectability: "robots-token-only",
          robotsToken: "Applebot-Extended"
        })
      ])
    );
  });

  it("keeps every registry entry structured for downstream reports", () => {
    expect(crawlerRules.length).toBeGreaterThanOrEqual(19);
    for (const rule of crawlerRules) {
      expect(rule).toMatchObject({
        id: expect.any(String),
        operator: expect.any(String),
        bot: expect.any(String),
        intent: expect.any(String),
        detectability: expect.stringMatching(
          /^(log-detectable|robots-token-only|suspected-or-community)$/
        )
      });
      expect(rule.docsUrl).toEqual(expect.any(String));
      expect(rule.notes).toEqual(expect.any(String));
    }
  });
});
