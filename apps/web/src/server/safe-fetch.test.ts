import { describe, expect, it, vi } from "vitest";
import { createCloudflareDohResolver, createSafeFetch } from "./safe-fetch";

const publicResolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

describe("createSafeFetch", () => {
  it("resolves public addresses through the fixed Cloudflare DoH endpoint", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const type = url.searchParams.get("type");
      return Response.json({
        Status: 0,
        Answer: type === "A"
          ? [{ type: 1, data: "203.0.113.10" }, { type: 5, data: "alias.example" }]
          : [{ type: 28, data: "2001:db8::10" }]
      });
    }) as unknown as typeof fetch;

    const resolver = createCloudflareDohResolver(fetchImpl);

    await expect(resolver("example.com")).resolves.toEqual(["203.0.113.10", "2001:db8::10"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [input, init] of vi.mocked(fetchImpl).mock.calls) {
      expect(new URL(input instanceof Request ? input.url : input.toString()).origin).toBe("https://cloudflare-dns.com");
      expect(init?.headers).toEqual({ accept: "application/dns-json" });
    }
  });

  it("blocks private destinations before issuing a request", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const safeFetch = createSafeFetch({ fetchImpl });
    await expect(safeFetch("http://127.0.0.1/admin")).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("validates redirect destinations", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } })
    );
    const safeFetch = createSafeFetch({ fetchImpl, resolver: publicResolver });
    await expect(safeFetch("https://example.com")).rejects.toThrow();
  });

  it("rejects oversized chunked bodies", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("0123456789", { headers: { "content-type": "text/html" } })
    );
    const safeFetch = createSafeFetch({ fetchImpl, resolver: publicResolver, maxBytes: 5 });
    await expect(safeFetch("https://example.com")).rejects.toThrow(/byte crawl limit/);
  });

  it("destroys a pinned dispatcher instead of waiting for graceful close after caller abort", async () => {
    const controller = new AbortController();
    const dispatcher = { close: vi.fn(async () => {}), destroy: vi.fn(async () => {}) };
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })) as unknown as typeof fetch;
    const safeFetch = createSafeFetch({
      fetchImpl,
      resolver: publicResolver,
      dispatcherFactory: () => dispatcher
    });

    const pending = safeFetch("https://example.com", { signal: controller.signal });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("Worker deadline exceeded.", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(dispatcher.destroy).toHaveBeenCalledTimes(1);
    expect(dispatcher.close).not.toHaveBeenCalled();
  });
});
