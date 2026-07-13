import { describe, expect, it, vi } from "vitest";
import { executePublicSourceRetrieval } from "./public-source-retriever";

const publicResolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

describe("V2 public-source retriever", () => {
  it("retrieves only robots-authorized public text through safe fetch", async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === "https://source.example/robots.txt") return new Response("User-agent: OpenGeoConsoleBot\nAllow: /");
      if (url === "https://source.example/article") {
        return new Response("<html><body><main> Public freight evidence. </main></body></html>", {
          headers: { "content-type": "text/html" }
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as unknown as typeof fetch;

    const fact = await executePublicSourceRetrieval({
      observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/article"
    }, { fetchImpl, resolver: publicResolver });

    expect(requested).toEqual(["https://source.example/robots.txt", "https://source.example/article"]);
    expect(fact).toMatchObject({
      retrievalState: "available", publiclyRoutable: true, robotsAllowed: true,
      accessBarrier: "none", normalizedText: "Public freight evidence.", verifiedExcerpt: "Public freight evidence."
    });
    expect(fact).not.toHaveProperty("body");
    expect(fact).not.toHaveProperty("html");
  });

  it("fails closed without content when robots denies the source", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://source.example/robots.txt") {
        return new Response("User-agent: OpenGeoConsoleBot\nDisallow: /");
      }
      throw new Error("source body must not be requested");
    }) as unknown as typeof fetch;

    const fact = await executePublicSourceRetrieval({
      observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/article"
    }, { fetchImpl, resolver: publicResolver });

    expect(fact).toMatchObject({ retrievalState: "robots_denied", robotsAllowed: false });
    expect(fact).not.toHaveProperty("normalizedText");
    expect(fact).not.toHaveProperty("verifiedExcerpt");
  });

  it("checks robots again after a cross-origin redirect and retains no body on denial", async () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url === "https://a.example/robots.txt") return new Response("User-agent: *\nAllow: /");
      if (url === "https://a.example/start") return new Response(null, { status: 302, headers: { location: "https://b.example/private" } });
      if (url === "https://b.example/robots.txt") return new Response("User-agent: OpenGeoConsoleBot\nDisallow: /private");
      throw new Error(`redirect target body must not be requested: ${url}`);
    }) as unknown as typeof fetch;

    const fact = await executePublicSourceRetrieval({
      observationId: "obs-1", queryId: "query-1", resultUrl: "https://a.example/start"
    }, { fetchImpl, resolver: publicResolver });

    expect(requested).toEqual(["https://a.example/robots.txt", "https://a.example/start", "https://b.example/robots.txt"]);
    expect(fact).toMatchObject({ retrievalState: "robots_denied", robotsAllowed: false });
    expect(fact).not.toHaveProperty("normalizedText");
  });

  it("returns an unavailable result without text for HTTP access barriers", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://source.example/robots.txt") return new Response("User-agent: *\nAllow: /");
      return new Response("sign in", { status: 401, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const fact = await executePublicSourceRetrieval({
      observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/article"
    }, { fetchImpl, resolver: publicResolver });

    expect(fact).toMatchObject({ retrievalState: "login_required", accessBarrier: "login" });
    expect(fact).not.toHaveProperty("normalizedText");
    expect(fact).not.toHaveProperty("verifiedExcerpt");
  });

  it("reports unsafe destinations without issuing network content requests", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const fact = await executePublicSourceRetrieval({
      observationId: "obs-1", queryId: "query-1", resultUrl: "http://127.0.0.1/private"
    }, { fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fact).toMatchObject({ retrievalState: "unsafe_destination", publiclyRoutable: false });
    expect(fact).not.toHaveProperty("normalizedText");
  });
});
