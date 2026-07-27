import { describe, expect, it } from "vitest";
import { CrawlPageError, classifyPageFailure } from "./failures";

describe("crawl page failure classification", () => {
  it.each([
    [new CrawlPageError("http-not-found", "missing", { status: 404 }), "permanent"],
    [new CrawlPageError("http-gone", "gone", { status: 410 }), "permanent"],
    [new Error("robots.txt disallows this page."), "permanent"],
    [new Error("Unsupported crawl content type: application/pdf"), "permanent"],
    [new Error("The redirect leaves the original registrable site."), "permanent"],
    [new Error("The page is outside the requested site boundary."), "permanent"]
  ])("does not retry permanent failures", (error, expected) => {
    expect(classifyPageFailure(error).disposition).toBe(expected);
  });

  it.each([
    [new CrawlPageError("http-rate-limited", "slow down", { status: 429 }), "http-rate-limited"],
    [new CrawlPageError("http-server-error", "bad gateway", { status: 502 }), "http-server-error"],
    [new Error("fetch failed: ECONNRESET"), "connection-reset"],
    [new Error("The operation timed out"), "timeout"],
    [new Error("DNS lookup EAI_AGAIN"), "dns"],
    [new Error("TLS handshake failed"), "tls"],
    [new Error("browser navigation failed"), "browser"]
  ])("retries transient failures", (error, code) => {
    expect(classifyPageFailure(error)).toMatchObject({ disposition: "transient", code });
  });
});
