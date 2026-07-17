import { describe, expect, it, vi } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import type {
  WebsiteSynthesisCheckpoint,
  WebsiteSynthesisRepository
} from "../db/report-v4-website-synthesis-checkpoints";
import {
  createReportV4WebsiteSynthesisProduction,
  REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID
} from "./report-v4-website-synthesis-production";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-04

const output = { summary: "Website summary", strengths: ["Clear"], gaps: ["Proof"], actions: ["Publish proof"] };
const page = {
  pageId: "page-1", url: "https://example.com/", contentHash: "a".repeat(64),
  readability: "direct_readable" as const, sourceLength: 8,
  chunks: [{ order: 1, summary: "summary", sourceLocations: [{ locationId: "loc-1", startOffset: 0, endOffset: 7 }] }]
};
const base = {
  reportId: "report-1", orderId: "order-1", coreJobId: "core-1", configSnapshotId: "config-1",
  siteSnapshotId: "snapshot-1", operationId: REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID, profileId: "report-v4-mimo-v2.5-pro-v1",
  workerId: "worker-1", leaseMs: 60_000, targetUrl: "https://example.com/", locale: "en", pages: [page]
};
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
  OGC_REPORT_V4_MIMO_API_KEY: "secret"
};

function checkpoint(state: WebsiteSynthesisCheckpoint["state"], providerCallCount: 0 | 1 = 0): WebsiteSynthesisCheckpoint {
  return {
    reportId: base.reportId, orderId: base.orderId, coreJobId: base.coreJobId,
    configSnapshotId: base.configSnapshotId, siteSnapshotId: base.siteSnapshotId,
    operationId: base.operationId, profileId: base.profileId, identityHash: "identity", state,
    workerId: state === "running" ? base.workerId : null,
    leaseExpiresAt: state === "running" ? "2099-01-01T00:00:00.000Z" : null,
    providerCallCount, correctionCount: 0, output: state === "completed" ? output : null,
    outputHash: state === "completed" ? "hash" : null, errorCode: null
  };
}

function repositoryHarness(initial: WebsiteSynthesisCheckpoint = checkpoint("queued")) {
  const events: string[] = [];
  const repository: WebsiteSynthesisRepository = {
    initialize: vi.fn(async () => { events.push("initialize"); return initial; }),
    claim: vi.fn(async () => { events.push("claim"); return checkpoint("running"); }),
    beginProviderCall: vi.fn(async () => { events.push("begin"); return checkpoint("running", 1); }),
    complete: vi.fn(async () => { events.push("complete"); return checkpoint("completed", 1); }),
    fail: vi.fn(async (input) => { events.push(`fail:${input.errorCode}`); return { ...checkpoint("failed", 1), errorCode: input.errorCode }; }),
    load: vi.fn(async () => null)
  };
  return { repository, events };
}

function response(value: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
}

describe("production V4 website synthesis", () => {
  it("reuses a completed checkpoint with zero provider calls", async () => {
    const h = repositoryHarness(checkpoint("completed"));
    const fetch = vi.fn(async () => response(output));
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch });
    await expect(run({ ...base, signal: new AbortController().signal })).resolves.toMatchObject({ reused: true, providerCalls: 0, output });
    expect(h.events).toEqual(["initialize"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("executes init, claim, begin, one provider call and complete in strict order", async () => {
    const h = repositoryHarness();
    const fetch = vi.fn(async () => { h.events.push("provider"); return response(output); });
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch });
    await expect(run({ ...base, signal: new AbortController().signal })).resolves.toMatchObject({ reused: false, providerCalls: 1, output });
    expect(h.events).toEqual(["initialize", "claim", "begin", "provider", "complete"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses an explicitly supplied provider without changing checkpoint ordering", async () => {
    const h = repositoryHarness();
    const fetch = vi.fn(async () => response(output));
    const provider = {
      synthesizeWebsite: vi.fn(async () => {
        h.events.push("provider");
        return output;
      })
    };
    const run = createReportV4WebsiteSynthesisProduction({
      environment,
      lockedModelProfile: profilePayload,
      repository: h.repository,
      fetch,
      provider
    });

    await expect(run({ ...base, signal: new AbortController().signal }))
      .resolves.toMatchObject({ reused: false, providerCalls: 1, output });
    expect(h.events).toEqual(["initialize", "claim", "begin", "provider", "complete"]);
    expect(provider.synthesizeWebsite).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects an over-budget request before checkpoint authorization or fetch", async () => {
    const h = repositoryHarness();
    const fetch = vi.fn(async () => response(output));
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch });
    const pages = Array.from({ length: 50 }, (_, index) => ({ ...page, pageId: `page-${index}`, url: `https://example.com/${index}`, contentHash: index.toString(16).padStart(64, "0"), chunks: [{ ...page.chunks[0], summary: "中".repeat(1_900), sourceLocations: [{ locationId: `loc-${index}`, startOffset: 0, endOffset: 7 }] }] }));
    await expect(run({ ...base, pages, signal: new AbortController().signal })).rejects.toThrow(/token|budget|exceed/i);
    expect(h.events).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("terminalizes a non-abort provider failure once without retry", async () => {
    const h = repositoryHarness();
    const fetch = vi.fn(async () => new Response("failure", { status: 500 }));
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch });
    await expect(run({ ...base, signal: new AbortController().signal })).rejects.toThrow();
    expect(h.events).toEqual(["initialize", "claim", "begin", "fail:website_synthesis_temporary_provider"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves a consumed checkpoint unterminated on abort", async () => {
    const h = repositoryHarness();
    const controller = new AbortController();
    const fetch = vi.fn(async () => { controller.abort(new DOMException("stopped", "AbortError")); throw controller.signal.reason; });
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch });
    await expect(run({ ...base, signal: controller.signal })).rejects.toThrow(/stopped/i);
    expect(h.events).toEqual(["initialize", "claim", "begin"]);
    expect(h.repository.fail).not.toHaveBeenCalled();
    expect(h.repository.complete).not.toHaveBeenCalled();
  });

  it("rejects locked-profile drift before database access", () => {
    const h = repositoryHarness();
    const drift = structuredClone(profilePayload) as Record<string, unknown>;
    drift.profileId = "drift";
    expect(() => createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: drift, repository: h.repository })).toThrow(/drift|approved|invalid/i);
    expect(h.events).toEqual([]);
  });

  it("rejects malicious pages before database access", async () => {
    const h = repositoryHarness();
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch: vi.fn() });
    await expect(run({ ...base, pages: [{ ...page, url: "javascript:alert(1)" }], signal: new AbortController().signal })).rejects.toThrow();
    expect(h.events).toEqual([]);
  });

  it("rejects a drifted operation before database access", async () => {
    const h = repositoryHarness();
    const run = createReportV4WebsiteSynthesisProduction({ environment, lockedModelProfile: profilePayload, repository: h.repository, fetch: vi.fn() });
    await expect(run({ ...base, operationId: "questionAnswer", signal: new AbortController().signal })).rejects.toThrow(/operation|drift/i);
    expect(h.events).toEqual([]);
  });
});
