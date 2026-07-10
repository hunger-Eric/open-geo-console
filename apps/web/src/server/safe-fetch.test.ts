import { describe, expect, it, vi } from "vitest";
import { createSafeFetch } from "./safe-fetch";

const publicResolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

describe("createSafeFetch", () => {
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
});
