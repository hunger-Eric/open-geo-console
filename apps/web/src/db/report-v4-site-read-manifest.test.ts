import { describe, expect, it, vi } from "vitest";
import {
  createReportV4AcceptanceSiteReadManifestRepository,
  hashReportV4AcceptanceSiteReadUrl,
  reportV4AcceptanceSiteReadIdentityHash,
  reportV4AcceptanceSiteReadPairBindingHash,
  type ReportV4AcceptanceSiteReadManifestStore
} from "./report-v4-site-read-manifest";

const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;
const sessionId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";

// @requirement GEO-V4-ACCEPT-01
describe("Report V4 protected-acceptance site-read manifest", () => {
  it("canonicalizes and hashes the raw URL before persistence without exposing sensitive input", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const rawUrl = "HTTPS://Example.COM:443/source?q=secret-token#fragment";
    await repository.begin({ sessionId, scenarioId, reportId: "report-1", jobId: "job-1",
      scope: "enhancement_source", purpose: "source", rawUrl, mode: "raw", attempt: 1,
      ownerQuestionId: "question-1", ownerSourceId: "source-1" });

    const persisted = store.begin.mock.calls[0]![0] as Record<string, unknown>;
    expect(persisted.urlHash).toBe(hashReportV4AcceptanceSiteReadUrl("https://example.com/source?q=secret-token"));
    expect(persisted).not.toHaveProperty("rawUrl");
    expect(JSON.stringify(persisted)).not.toContain("secret-token");
    expect(persisted.identityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted.pairBindingHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("domain-separates identity and pair hashes while pairing raw/browser across owner labels", () => {
    const base = { sessionId, scenarioId, reportId: "report-1", jobId: "enhancement-1",
      scope: "enhancement_source" as const, purpose: "source" as const,
      urlHash: "a".repeat(64), attempt: 1 as const };
    const rawFirst = { ...base, mode: "raw" as const, ownerQuestionId: "question-1", ownerSourceId: "source-1" };
    const browserOtherOwner = { ...base, mode: "browser" as const, ownerQuestionId: "question-2", ownerSourceId: "source-2" };
    expect(reportV4AcceptanceSiteReadPairBindingHash(rawFirst))
      .toBe(reportV4AcceptanceSiteReadPairBindingHash(browserOtherOwner));
    expect(reportV4AcceptanceSiteReadIdentityHash(rawFirst))
      .not.toBe(reportV4AcceptanceSiteReadIdentityHash(browserOtherOwner));
    expect(reportV4AcceptanceSiteReadIdentityHash(rawFirst))
      .not.toBe(reportV4AcceptanceSiteReadPairBindingHash(rawFirst));
  });

  it("validates exact scope, purpose, attempt, owner, mode, hashes, and protected preview policy", async () => {
    const store = fakeStore();
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const admission = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1",
      scope: "admission_page" as const, purpose: "page" as const,
      rawUrl: "https://example.com/", mode: "raw" as const, attempt: 0 as const };
    await repository.begin(admission);
    await expect(repository.begin({ ...admission, purpose: "source" } as never)).rejects.toThrow(/scope.*purpose.*attempt.*owner/i);
    await expect(repository.begin({ ...admission, ownerQuestionId: "q" } as never)).rejects.toThrow(/fields/i);
    await expect(repository.begin({ ...admission, mode: "cache" } as never)).rejects.toThrow(/mode/i);
    await expect(repository.begin({ ...admission, rawUrl: "https://user:password@example.com/" })).rejects.toThrow(/credentials/i);
    await expect(repository.terminalize({ sessionId, scenarioId, identityHash: "x", terminalPhase: "completed" }))
      .rejects.toThrow(/hash/i);
    await expect(repository.terminalize({ sessionId, scenarioId, identityHash: "a".repeat(64), terminalPhase: "observed" as never }))
      .rejects.toThrow(/completed or failed/i);

    const production = createReportV4AcceptanceSiteReadManifestRepository(store, {
      VERCEL_ENV: "production", OGC_DEPLOYMENT_PROFILE: "production", COMMERCE_MODE: "live"
    } as NodeJS.ProcessEnv);
    await expect(production.begin(admission)).rejects.toThrow(/protected staging preview/i);
    await expect(production.loadScenarioManifest({ sessionId, scenarioId })).rejects.toThrow(/protected staging preview/i);
  });

  it("sends deterministic exact replay claims to the store and returns only hash-safe rows", async () => {
    const calls: Record<string, unknown>[] = [];
    const store = fakeStore();
    store.begin.mockImplementation(async (input: Record<string, unknown>) => {
      calls.push(input);
      return { entry: entry(input), inserted: calls.length === 1 };
    });
    const repository = createReportV4AcceptanceSiteReadManifestRepository(store, environment);
    const input = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1",
      scope: "admission_discovery" as const, purpose: "robots" as const,
      rawUrl: "https://example.com/robots.txt#ignored", mode: "raw" as const, attempt: 0 as const };
    const first = await repository.begin(input);
    const replay = await repository.begin(input);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
    expect(first.inserted).toBe(true);
    expect(replay.inserted).toBe(false);
    expect(replay.entry).not.toHaveProperty("rawUrl");
    expect(Object.keys(replay.entry).sort()).toEqual([
      "attempt", "identityHash", "jobId", "mode", "networkPerformed", "ownerQuestionId", "ownerSourceId",
      "pairBindingHash", "purpose", "reportId", "scenarioId", "scope", "sessionId", "startedAt",
      "terminalAt", "terminalPhase", "urlHash"
    ].sort());
  });
});

function fakeStore(): ReportV4AcceptanceSiteReadManifestStore & Record<string, ReturnType<typeof vi.fn>> {
  return { begin: vi.fn(), terminalize: vi.fn(), loadScenarioManifest: vi.fn() } as never;
}

function entry(input: Record<string, unknown>) {
  return { ...input, networkPerformed: true as const, terminalPhase: null, startedAt: new Date("2026-07-17T00:00:00Z"), terminalAt: null } as never;
}
