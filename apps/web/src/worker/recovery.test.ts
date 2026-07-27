import { describe, expect, it, vi } from "vitest";
import type { PlannedPage } from "@open-geo-console/ai-report-engine";
import {
  calculateEffectiveCoverage,
  determineResumeStage,
  fetchPlannedPagesWithRecovery,
  isCompatibleDeferredPageAnalysis,
  selectReusableCompletedPageAnalyses,
  type CompletedPageAnalysis,
  type RecoveryCheckpoint
} from "./recovery";

const pages = [
  ["https://shun-express.com/", "home"],
  ["https://shun-express.com/transient-service", "service"],
  ["https://shun-express.com/dead-1", "other"],
  ["https://shun-express.com/dead-2", "other"],
  ["https://shun-express.com/dead-3", "other"],
  ["https://shun-express.com/dead-4", "other"],
  ["https://shun-express.com/replacement-1", "product"],
  ["https://shun-express.com/replacement-2", "blog"],
  ["https://shun-express.com/replacement-3", "about"],
  ["https://shun-express.com/replacement-4", "contact"],
  ["https://shun-express.com/spare", "news"]
] satisfies Array<[string, PlannedPage["pageType"]]>;

const ranked: PlannedPage[] = pages.map(([url, pageType], index) => ({
  url,
  pageType,
  priority: 100 - index,
  reason: "fixture"
}));

describe("worker recovery", () => {
  it("does not retry permanent failures, retries transient pages three times, and backfills without refetching successes", async () => {
    const calls = new Map<string, number>();
    const fetchPage = vi.fn(async (page: PlannedPage) => {
      const attempt = (calls.get(page.url) ?? 0) + 1;
      calls.set(page.url, attempt);
      if (page.url.includes("/dead-")) {
        throw new Error("Page returned HTTP 404.");
      }
      if (page.url.endsWith("transient-service") && attempt < 3) {
        throw new Error("fetch failed: ECONNRESET");
      }
      return { url: page.url, contentHash: `hash-${page.url}` };
    });
    const checkpoints: RecoveryCheckpoint[] = [];

    const result = await fetchPlannedPagesWithRecovery({
      targetPageCount: 6,
      rankedCandidates: ranked,
      effectivePlan: ranked.slice(0, 6),
      checkpoint: { completedCrawlUrls: [ranked[0]!.url] },
      loadCompleted: async (page) => ({ url: page.url, contentHash: `hash-${page.url}` }),
      fetchPage,
      delay: async () => undefined,
      saveCheckpoint: async (checkpoint) => {
        checkpoints.push(structuredClone(checkpoint));
      }
    });

    expect(calls.get(ranked[0]!.url)).toBeUndefined();
    for (const page of ranked.slice(2, 6)) expect(calls.get(page.url)).toBe(1);
    expect(calls.get(ranked[1]!.url)).toBe(3);
    expect(calls.get(ranked[6]!.url)).toBe(1);
    expect(calls.get(ranked[7]!.url)).toBe(1);
    expect(calls.get(ranked[8]!.url)).toBe(1);
    expect(calls.get(ranked[9]!.url)).toBe(1);
    expect(calls.get(ranked[10]!.url)).toBeUndefined();
    expect(result.checkpoint.permanentFailures).toHaveLength(4);
    expect(result.checkpoint.completedCrawlUrls).toHaveLength(6);
    expect(result.checkpoint.effectivePlan?.map(({ url }) => url)).not.toContain(ranked[2]!.url);
    expect(checkpoints.length).toBeGreaterThan(5);
  });

  it("keeps exhausted transient failures in the effective denominator but excludes permanent failures", () => {
    expect(calculateEffectiveCoverage({
      discoveredCandidateCount: 11,
      effectivePlannedUrls: ["home", "one", "two", "transient"],
      completedCrawlUrls: ["home", "one", "two"],
      permanentFailures: [{ url: "dead", error: "404", code: "http-not-found" }],
      exhaustedTransientUrls: ["transient"]
    })).toEqual({
      discoveredPages: 11,
      permanentlyInvalidPages: 1,
      effectivePlannedPages: 4,
      analyzedPages: 3,
      exhaustedTransientPages: 1,
      ratio: 0.75
    });
  });

  it("resumes at the earliest incomplete stage", () => {
    expect(determineResumeStage({})).toBe("discovering");
    expect(determineResumeStage({ rankedCandidates: ranked, targetPageCount: 6 })).toBe("planning");
    expect(determineResumeStage({ rankedCandidates: ranked, targetPageCount: 6, effectivePlan: ranked.slice(0, 6) })).toBe("fetching");
    expect(determineResumeStage({
      rankedCandidates: ranked,
      targetPageCount: 1,
      effectivePlan: ranked.slice(0, 1),
      completedCrawlUrls: [ranked[0]!.url]
    })).toBe("analyzing");
    expect(determineResumeStage({
      rankedCandidates: ranked,
      targetPageCount: 1,
      effectivePlan: ranked.slice(0, 1),
      completedCrawlUrls: [ranked[0]!.url],
      completedPageAnalyses: [{
        url: ranked[0]!.url,
        contentHash: "hash-home",
        analysis: { url: ranked[0]!.url, pageType: "home", summary: "ok", organizationSignals: [], strengths: [], findings: [] }
      }]
    })).toBe("synthesizing");
  });

  it("marker-absent: missing analysisAuthority remains legal and counts as analyzed", () => {
    const entry: CompletedPageAnalysis = {
      url: ranked[0]!.url,
      contentHash: "hash-home",
      analysis: { url: ranked[0]!.url, pageType: "home", summary: "ok", organizationSignals: [], strengths: [], findings: [] }
    };
    expect(determineResumeStage({
      rankedCandidates: ranked,
      targetPageCount: 1,
      effectivePlan: ranked.slice(0, 1),
      completedCrawlUrls: [ranked[0]!.url],
      completedPageAnalyses: [entry]
    })).toBe("synthesizing");
    const evidenceByUrl = new Map([[ranked[0]!.url, { contentHash: "hash-home" }]]);
    expect(selectReusableCompletedPageAnalyses([entry], {
      evidenceByUrl,
      canonicalUrl: (url) => url,
      requiredDeferredAuthority: null
    })).toEqual([entry]);
  });

  it("marker-present: legacy / missing identity / version mismatch are not analysis-complete", () => {
    const required = { mode: "deferred" as const, semanticContractVersion: "report-semantic-review-v1" };
    const missingIdentity: CompletedPageAnalysis = {
      url: ranked[0]!.url,
      contentHash: "hash-home",
      analysis: { url: ranked[0]!.url, pageType: "home", summary: "ok", organizationSignals: [], strengths: [], findings: [] }
    };
    const legacy: CompletedPageAnalysis = {
      ...missingIdentity,
      analysisAuthority: { mode: "legacy", semanticContractVersion: null }
    };
    const wrongVersion: CompletedPageAnalysis = {
      ...missingIdentity,
      analysisAuthority: { mode: "deferred", semanticContractVersion: "report-semantic-review-v0" }
    };
    const matching: CompletedPageAnalysis = {
      ...missingIdentity,
      analysisAuthority: { mode: "deferred", semanticContractVersion: "report-semantic-review-v1" }
    };

    expect(isCompatibleDeferredPageAnalysis(missingIdentity, required)).toBe(false);
    expect(isCompatibleDeferredPageAnalysis(legacy, required)).toBe(false);
    expect(isCompatibleDeferredPageAnalysis(wrongVersion, required)).toBe(false);
    expect(isCompatibleDeferredPageAnalysis(matching, required)).toBe(true);

    for (const entry of [missingIdentity, legacy, wrongVersion]) {
      expect(determineResumeStage({
        rankedCandidates: ranked,
        targetPageCount: 1,
        effectivePlan: ranked.slice(0, 1),
        completedCrawlUrls: [ranked[0]!.url],
        completedPageAnalyses: [entry]
      }, { requiredDeferredAuthority: required })).toBe("analyzing");
    }
    expect(determineResumeStage({
      rankedCandidates: ranked,
      targetPageCount: 1,
      effectivePlan: ranked.slice(0, 1),
      completedCrawlUrls: [ranked[0]!.url],
      completedPageAnalyses: [matching]
    }, { requiredDeferredAuthority: required })).toBe("synthesizing");
  });

  it("selectReusableCompletedPageAnalyses keeps only fully matching marker-present entries", () => {
    const required = { mode: "deferred" as const, semanticContractVersion: "report-semantic-review-v1" };
    const home = ranked[0]!.url;
    const service = ranked[1]!.url;
    const entries: CompletedPageAnalysis[] = [
      {
        url: home,
        contentHash: "hash-home",
        analysis: { url: home, pageType: "home", summary: "ok", organizationSignals: [], strengths: [], findings: [] },
        analysisAuthority: { mode: "deferred", semanticContractVersion: "report-semantic-review-v1" }
      },
      {
        url: service,
        contentHash: "hash-service",
        analysis: { url: service, pageType: "service", summary: "legacy", organizationSignals: [], strengths: [], findings: [] }
      }
    ];
    const evidenceByUrl = new Map([
      [home, { contentHash: "hash-home" }],
      [service, { contentHash: "hash-service" }]
    ]);
    const reusable = selectReusableCompletedPageAnalyses(entries, {
      evidenceByUrl,
      canonicalUrl: (url) => url,
      requiredDeferredAuthority: required
    });
    expect(reusable).toHaveLength(1);
    expect(reusable[0]!.url).toBe(home);
  });
});
