import { describe, expect, it, vi } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import { resolveReportV4LockedModelRuntime } from "./model-runtime-config";
import { createReportV4MimoSiteSynthesisProvider } from "./mimo-site-synthesis-provider";

const env = () => ({
  OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
  OGC_REPORT_V4_MIMO_API_KEY: "secret",
  OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-mimo-v2.5-pro-v1"
});
const context = { pageId: "p1", url: "https://example.com/", contentHash: "a".repeat(64), readability: "direct_readable" as const, sourceLength: 8 };
const page = { ...context, chunks: [{ order: 1, summary: "summary", sourceLocations: [{ locationId: "l1", startOffset: 0, endOffset: 7 }] }] };
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

describe("dedicated V4 site synthesis MiMo adapter", () => {
  it("sends bounded page analysis with no tools and parses the contract", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ chunks: page.chunks }));
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    await expect(provider.analyzePage({ context, retainedText: "retained" }, new AbortController().signal)).resolves.toEqual(page);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("mimo-v2.5-pro");
    expect(body.tools).toBeUndefined();
    expect(body.messages[1].content).toContain("retained");
  });

  it("synthesizes only validated summaries and rejects malformed output", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ summary: "ok", strengths: ["s"], gaps: ["g"], actions: ["a"] }));
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedRuntime: resolveReportV4LockedModelRuntime(profilePayload) });
    await expect(provider.synthesizeWebsite({ targetUrl: "https://example.com/", locale: "en", pages: [page] }, new AbortController().signal)).resolves.toMatchObject({ summary: "ok" });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(JSON.parse(body.messages[1].content).targetUrl).toBe("https://example.com/");
    expect(body.messages[1].content).not.toContain("retained");
  });

  it("fails before fetch for drift and oversized input", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ chunks: page.chunks }));
    const drift = structuredClone(profilePayload) as Record<string, unknown>;
    drift.profileId = "drift";
    expect(() => createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: drift })).toThrow(/drift|approved|invalid/i);
    expect(fetch).not.toHaveBeenCalled();
    const valid = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    await expect(valid.analyzePage({ context: { ...context, sourceLength: 100_001 }, retainedText: "x".repeat(100_001) }, new AbortController().signal)).rejects.toThrow(/budget|exceed|token/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
