import { describe, expect, it, vi } from "vitest";
import { matchUserAgent } from "@open-geo-console/crawler-rules";
import {
  compareSimulatorRunWithLogEntries,
  runExternalCrawlerSimulation,
  selectSimulatorBotProfiles
} from "./index";

describe("external crawler simulator", () => {
  it("discovers public paths and requests them with log-detectable bot profiles", async () => {
    const calls: { url: string; userAgent?: string }[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const headers = new Headers(init?.headers);
      const userAgent = headers.get("User-Agent") ?? undefined;
      calls.push({ url: url.toString(), userAgent });

      if (userAgent) {
        return new Response("", { status: 200 });
      }

      if (url.pathname === "/robots.txt") {
        return new Response("Sitemap: https://example.com/sitemap.xml", { status: 200 });
      }
      if (url.pathname === "/sitemap.xml") {
        return new Response(
          [
            "<urlset>",
            "<url><loc>https://example.com/projects/alpha</loc></url>",
            "<url><loc>https://example.com/articles/agent-notes</loc></url>",
            "<url><loc>https://example.com/contact</loc></url>",
            "</urlset>"
          ].join(""),
          { status: 200 }
        );
      }
      if (url.pathname === "/llms.txt") {
        return new Response(
          [
            "# Example",
            "- [Projects](/projects/alpha)",
            "- [Article](/articles/agent-notes)",
            "- [Brand facts](/.well-known/brand-facts.json)"
          ].join("\n"),
          { status: 200 }
        );
      }
      if (url.pathname === "/.well-known/brand-facts.json") {
        return new Response("{}", { status: 200 });
      }

      return new Response("", { status: 404 });
    });

    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com/some/path?ignored=true",
      runId: "run-1",
      generatedAt: "2026-07-08T00:00:00.000Z",
      botRuleIds: ["openai-gptbot", "google-extended", "anthropic-claudebot"],
      maxPaths: 6,
      maxRequests: 12,
      fetchImpl
    });

    expect(run).toMatchObject({
      runId: "run-1",
      sourceUrl: "https://example.com",
      generatedAt: "2026-07-08T00:00:00.000Z"
    });
    expect(run.discovery.selectedPaths).toEqual([
      "/",
      "/projects/alpha",
      "/articles/agent-notes",
      "/llms.txt",
      "/sitemap.xml",
      "/.well-known/brand-facts.json"
    ]);
    expect(run.attempted).toHaveLength(12);
    expect(run.attempted.every((attempt) => attempt.runMarker === "run-1")).toBe(true);
    expect(run.attempted.every((attempt) => attempt.url.includes("ogc_run=run-1"))).toBe(true);
    expect(run.attempted.map((attempt) => attempt.bot)).not.toContain("Google-Extended");
    expect(run.attempted.map((attempt) => attempt.userAgent)).toEqual(
      expect.arrayContaining([
        "GPTBot/1.0 (+https://openai.com/gptbot)",
        "ClaudeBot/1.0 (+https://www.anthropic.com)"
      ])
    );

    const botCalls = calls.filter((call) => call.userAgent);
    expect(botCalls).toHaveLength(12);
    expect(botCalls[0]).toMatchObject({
      url: "https://example.com/?ogc_run=run-1",
      userAgent: "GPTBot/1.0 (+https://openai.com/gptbot)"
    });
  });

  it("records network failures as explicit attempt errors", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const headers = new Headers(init?.headers);
      if (headers.has("User-Agent")) {
        throw new Error(`network blocked for ${url.pathname}`);
      }
      return new Response("", { status: 404 });
    });

    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com",
      runId: "run-error",
      botRuleIds: ["openai-gptbot"],
      maxPaths: 1,
      maxRequests: 1,
      fetchImpl
    });

    expect(run.attempted).toEqual([
      expect.objectContaining({
        path: "/",
        ok: false,
        error: "network blocked for /"
      })
    ]);
    expect(run.attempted[0]).not.toHaveProperty("status");
  });

  it("records per-request timeouts as explicit resource and attempt errors", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const headers = new Headers(init?.headers);
      if (url.pathname === "/robots.txt" || headers.has("User-Agent")) {
        return new Promise<Response>(() => undefined);
      }
      return Promise.resolve(new Response("", { status: 404 }));
    });

    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com",
      runId: "run-timeout",
      botRuleIds: ["openai-gptbot"],
      maxPaths: 1,
      maxRequests: 1,
      requestTimeoutMs: 5,
      fetchImpl
    });

    expect(run.discovery.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/robots.txt",
          ok: false,
          error: expect.stringMatching(
            /^Request timed out after 5ms: https:\/\/example\.com\/robots\.txt$/
          )
        })
      ])
    );
    expect(run.discovery.selectedPaths).toEqual(["/"]);
    expect(run.attempted).toEqual([
      expect.objectContaining({
        path: "/",
        ok: false,
        error: expect.stringMatching(
          /^Request timed out after 5ms: https:\/\/example\.com\/\?ogc_run=run-timeout$/
        )
      })
    ]);
    expect(run.attempted[0]).not.toHaveProperty("status");
  });

  it("keeps caller-provided maxPaths and maxRequests as hard run bounds", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      const headers = new Headers(init?.headers);
      if (headers.has("User-Agent")) {
        return new Response("", { status: 200 });
      }
      if (url.pathname === "/sitemap.xml") {
        return new Response(
          [
            "<urlset>",
            "<url><loc>https://example.com/projects/alpha</loc></url>",
            "<url><loc>https://example.com/articles/beta</loc></url>",
            "<url><loc>https://example.com/articles/gamma</loc></url>",
            "</urlset>"
          ].join(""),
          { status: 200 }
        );
      }
      return new Response("", { status: 404 });
    });

    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com",
      runId: "run-bounds",
      maxPaths: 2,
      maxRequests: 3,
      fetchImpl
    });

    expect(run.discovery.selectedPaths).toHaveLength(2);
    expect(run.attempted).toHaveLength(3);
    expect(run.attempted.map((attempt) => attempt.requestPath)).toEqual([
      "/?ogc_run=run-bounds",
      "/?ogc_run=run-bounds",
      "/?ogc_run=run-bounds"
    ]);
  });

  it("compares simulator attempts with parsed log-like entries by run marker and user agent", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.has("User-Agent")) {
        return new Response("", { status: 204 });
      }
      return new Response("", { status: 404 });
    });
    const run = await runExternalCrawlerSimulation({
      sourceUrl: "https://example.com",
      runId: "run-logs",
      botRuleIds: ["openai-gptbot"],
      maxPaths: 1,
      maxRequests: 1,
      fetchImpl
    });

    const comparison = compareSimulatorRunWithLogEntries(run, [
      {
        path: "/?ogc_run=run-logs",
        userAgent: "GPTBot/1.0 (+https://openai.com/gptbot)",
        status: 204
      },
      {
        path: "/?ogc_run=other",
        userAgent: "GPTBot/1.0 (+https://openai.com/gptbot)",
        status: 204
      }
    ]);

    expect(comparison).toEqual([
      {
        attempt: run.attempted[0],
        matched: true,
        matches: [
          {
            path: "/?ogc_run=run-logs",
            userAgent: "GPTBot/1.0 (+https://openai.com/gptbot)",
            status: 204
          }
        ]
      }
    ]);
  });

  it("does not create profiles for robots-token-only policy entries", () => {
    expect(selectSimulatorBotProfiles(["google-extended", "apple-applebot-extended"])).toEqual([]);
  });

  it("includes the default V1 HTTP user-agent crawler families", () => {
    const profiles = selectSimulatorBotProfiles();

    expect(profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operator: "OpenAI", bot: "GPTBot" }),
        expect.objectContaining({ operator: "OpenAI", bot: "OAI-SearchBot" }),
        expect.objectContaining({ operator: "OpenAI", bot: "ChatGPT-User" }),
        expect.objectContaining({ operator: "Anthropic", bot: "ClaudeBot" }),
        expect.objectContaining({ operator: "Anthropic", bot: "Claude-SearchBot" }),
        expect.objectContaining({ operator: "Perplexity", bot: "PerplexityBot" }),
        expect.objectContaining({ operator: "Google", bot: "Googlebot" }),
        expect.objectContaining({ operator: "Microsoft", bot: "Bingbot" }),
        expect.objectContaining({ operator: "Meta", bot: "Meta-ExternalAgent" }),
        expect.objectContaining({ operator: "ByteDance", bot: "Bytespider" }),
        expect.objectContaining({ operator: "Amazon", bot: "Amazonbot" }),
        expect.objectContaining({ operator: "Apple", bot: "Applebot" }),
        expect.objectContaining({ operator: "Common Crawl", bot: "CCBot" })
      ])
    );
    expect(profiles.map((profile) => profile.bot)).not.toEqual(
      expect.arrayContaining(["Google-Extended", "Applebot-Extended"])
    );
    expect(
      profiles.every((profile) => {
        const match = matchUserAgent(profile.userAgent);
        return match?.bot === profile.bot && match.detectability !== "robots-token-only";
      })
    ).toBe(true);
  });
});
