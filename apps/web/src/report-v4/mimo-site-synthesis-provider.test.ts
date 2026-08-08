import { describe, expect, it, vi } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import { resolveReportV4LockedModelRuntime } from "./model-runtime-config";
import {
  createReportV4MimoSiteSynthesisProvider,
  ReportV4MimoSiteSynthesisOutputError
} from "./mimo-site-synthesis-provider";

const env = () => ({
  NODE_ENV: "test",
  OGC_PROVIDER_PROFILE: "mimo_native",
  OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
  OGC_REPORT_V4_MIMO_API_KEY: "secret",
  OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-mimo-v2.5-pro-v1"
});
const context = { pageId: "p1", url: "https://example.com/", contentHash: "a".repeat(64), readability: "direct_readable" as const, sourceLength: 8 };
const page = { ...context, chunks: [{ order: 1, summary: "summary", sourceLocations: [{ locationId: "location-1-1", startOffset: 0, endOffset: 8 }] }] };
const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });

describe("dedicated V4 site synthesis MiMo adapter", () => {
  it("sends bounded page analysis with no tools and parses the contract", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({
      chunks: [{ order: 1, summary: "summary", evidenceSegmentIds: ["segment-1"] }]
    }));
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    await expect(provider.analyzePage({ context, retainedText: "retained" }, new AbortController().signal)).resolves.toEqual(page);
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("mimo-v2.5-pro");
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toContain("Return 1 to 8 chunks");
    expect(body.messages[0].content).toContain("evidenceSegmentIds");
    const modelInput = JSON.parse(body.messages[1].content);
    expect(modelInput.retainedText).toBeUndefined();
    expect(modelInput.evidenceSegments).toEqual([
      { segmentId: "segment-1", text: "retained" }
    ]);
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
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({
      chunks: [{ order: 1, summary: "summary", evidenceSegmentIds: ["segment-1"] }]
    }));
    const drift = structuredClone(profilePayload) as Record<string, unknown>;
    drift.profileId = "drift";
    expect(() => createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: drift })).toThrow(/drift|approved|invalid/i);
    expect(fetch).not.toHaveBeenCalled();
    const valid = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    // The calibrated estimator charges ~1 token per 4 ASCII characters.
    await expect(valid.analyzePage({ context: { ...context, sourceLength: 100_001 * 4 }, retainedText: "x".repeat(100_001 * 4) }, new AbortController().signal)).rejects.toThrow(/budget|exceed|token/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps CRLF, JSON escapes, Chinese and a surrogate pair across the exact 320 UTF-16 boundary", async () => {
    const prefix = "第一段\r\n包含\\\"引号\\\"";
    const retainedText = `${prefix}${"x".repeat(319 - prefix.length)}😀\r\n第二段中文`;
    const exactContext = { ...context, sourceLength: retainedText.length };
    let suppliedSegments: Array<{ segmentId: string; text: string }> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const input = JSON.parse(body.messages[1].content) as {
        evidenceSegments: Array<{ segmentId: string; text: string }>;
      };
      suppliedSegments = input.evidenceSegments;
      return response({
        chunks: [{
          order: 1,
          summary: "mixed evidence",
          evidenceSegmentIds: input.evidenceSegments.map(({ segmentId }) => segmentId)
        }]
      });
    });
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    const result = await provider.analyzePage({ context: exactContext, retainedText }, new AbortController().signal);
    expect(suppliedSegments).toEqual([
      { segmentId: "segment-1", text: retainedText.slice(0, 319) },
      { segmentId: "segment-2", text: retainedText.slice(319) }
    ]);
    expect(suppliedSegments[1]!.text.startsWith("😀\r\n第二段中文")).toBe(true);
    expect(result.chunks[0]!.sourceLocations.map(({ startOffset, endOffset }) => ({ startOffset, endOffset }))).toEqual([
      { startOffset: 0, endOffset: 319 },
      { startOffset: 319, endOffset: retainedText.length }
    ]);
    expect(result.chunks[0]!.sourceLocations.map(({ startOffset, endOffset }) => retainedText.slice(startOffset, endOffset)))
      .toEqual(suppliedSegments.map(({ text }) => text));
  });

  it.each([
    ["duplicate", { chunks: [{ order: 1, summary: "invalid evidence", evidenceSegmentIds: ["segment-1", "segment-1"] }] }, "retained"],
    ["malformed", { chunks: [{ order: 1, summary: "invalid evidence", evidenceSegmentIds: [1] }] }, "retained"],
    ["unknown", { chunks: [{ order: 1, summary: "invalid evidence", evidenceSegmentIds: ["segment-999"] }] }, "retained"],
    ["over-budget", { chunks: [{ order: 1, summary: "invalid evidence", evidenceSegmentIds: Array.from({ length: 9 }, (_, index) => `segment-${index + 1}`) }] }, "x".repeat(2_881)]
  ])("rejects %s evidence-segment selection", async (_label, modelOutput, retainedText) => {
    const exactContext = { ...context, sourceLength: retainedText.length };
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response(modelOutput));
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    const result = provider.analyzePage({ context: exactContext, retainedText }, new AbortController().signal);
    await expect(result).rejects.toBeInstanceOf(ReportV4MimoSiteSynthesisOutputError);
    await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ message: expect.stringMatching(/segment|contract|contain/i) }));
  });

  it("rejects model-supplied offsets without weakening strict evidence bounds", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({
      chunks: [{
        order: 1,
        summary: "invalid evidence",
        evidenceSegmentIds: ["segment-1"],
        sourceLocations: [{ locationId: "l1", startOffset: 0, endOffset: 8 }]
      }]
    }));
    const provider = createReportV4MimoSiteSynthesisProvider({ environment: env(), fetch, lockedModelProfile: profilePayload });
    const result = provider.analyzePage({ context, retainedText: "retained" }, new AbortController().signal);
    await expect(result).rejects.toBeInstanceOf(ReportV4MimoSiteSynthesisOutputError);
    await expect(result).rejects.toHaveProperty("cause", expect.objectContaining({ message: expect.stringMatching(/field|segment|contract/i) }));
  });
});
