import { describe, expect, it, vi } from "vitest";
import {
  assertProbeEnvironment,
  createDefaultProbeDependencies,
  createReadBudget,
  executeProbeCli,
  runStagingV4AdmissionNoCommerceProbe,
  type StagingV4AdmissionProbeDependencies
} from "./staging-v4-admission-no-commerce-probe";

const input = {
  targetUrl: "https://portal.example/",
  expectedSiteKey: "portal.example",
  expectedText: "Public logistics evidence",
  expectedAnalyzablePages: 1,
  maxReads: 3,
  maxElapsedMs: 100
};

describe("staging V4 admission no-commerce probe", () => {
  it("runs through injected in-memory admission dependencies and emits one bounded result", async () => {
    const dependencies = probeDependencies();

    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).resolves.toMatchObject({
      ok: true,
      status: "completed",
      siteKey: "portal.example",
      candidateCount: 1,
      analyzablePages: 1,
      excludedPages: 0,
      distinctContentHashes: 1,
      rawHttpReads: 1,
      browserReads: 0,
      expectedTextMatched: true
    });
    expect(dependencies.databaseTouch).not.toHaveBeenCalled();
  });

  it.each([
    ["DATABASE_URL is present", { OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test", DATABASE_URL: "" }],
    ["profile is not staging", { OGC_DEPLOYMENT_PROFILE: "production", VERCEL_ENV: "preview", COMMERCE_MODE: "test" }],
    ["environment is not preview", { OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "production", COMMERCE_MODE: "test" }],
    ["commerce mode is not test", { OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "live" }]
  ])("fails closed when %s", (_label, env) => {
    expect(() => assertProbeEnvironment(env)).toThrow(/no-commerce probe/i);
  });

  it.each([
    ["terminal status", { status: "completed_limited" }],
    ["body count", { analyzablePages: 2 }],
    ["site identity", { siteKey: "elsewhere.example" }],
    ["expected text", { expectedTextMatched: false }],
    ["candidate frontier", { candidateCount: 4 }],
    ["read bound", { rawHttpReads: 4 }],
    ["elapsed bound", { elapsedMs: 101 }]
  ])("fails closed on %s mismatch", async (_label, override) => {
    await expect(runStagingV4AdmissionNoCommerceProbe(input, probeDependencies(override))).rejects.toThrow(/probe expectation/i);
  });

  it("does not return a success result when an injected operation throws", async () => {
    const dependencies = probeDependencies();
    dependencies.discover = vi.fn(async () => { throw new Error("fixture discovery failure"); });

    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).rejects.toThrow("fixture discovery failure");
  });

  it("passes one signal through discovery and admission, aborting before a timed-out discovery can succeed", async () => {
    const dependencies = probeDependencies();
    let timeout: (() => void) | undefined;
    dependencies.scheduleTimeout = vi.fn((callback) => { timeout = callback; return vi.fn(); });
    dependencies.discover = vi.fn(async (_target, signal) => {
      timeout?.();
      if (signal.aborted) throw signal.reason;
      throw new Error("expected abort");
    });

    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).rejects.toThrow(/timed out/i);
    expect(dependencies.runAdmission).not.toHaveBeenCalled();
  });

  it("passes the same non-aborted signal from discovery to admission", async () => {
    const dependencies = probeDependencies();
    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).resolves.toMatchObject({ ok: true });
    const discoverySignal = dependencies.discover.mock.calls[0]?.[1];
    const admissionSignal = dependencies.runAdmission.mock.calls[0]?.[0].signal;
    expect(admissionSignal).toBe(discoverySignal);
    expect(admissionSignal.aborted).toBe(false);
  });

  it("includes discovery time in the global budget without sleeping", async () => {
    const dependencies = probeDependencies();
    dependencies.nowMs = vi.fn().mockReturnValueOnce(0).mockReturnValue(101);

    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).rejects.toThrow(/probe expectation/i);
  });

  it.each(["raw", "browser", "mixed"])("blocks a fourth %s underlying read before it starts", async (mode) => {
    const browser = vi.fn(async () => "rendered");
    const raw = vi.fn();
    const reads = createReadBudget(3);
    const render = reads.wrapBrowser(browser);
    if (mode === "raw") {
      reads.beforeRawRequest(); raw(); reads.beforeRawRequest(); raw(); reads.beforeRawRequest(); raw();
      expect(() => reads.beforeRawRequest()).toThrow(/budget/i);
      expect(raw).toHaveBeenCalledTimes(3);
    } else if (mode === "browser") {
      await render("https://fixture.example/1"); await render("https://fixture.example/2"); await render("https://fixture.example/3");
      await expect(render("https://fixture.example/4")).rejects.toThrow(/budget/i);
      expect(browser).toHaveBeenCalledTimes(3);
    } else {
      reads.beforeRawRequest(); raw(); await render("https://fixture.example/2"); reads.beforeRawRequest(); raw();
      await expect(render("https://fixture.example/4")).rejects.toThrow(/budget/i);
      expect(raw).toHaveBeenCalledTimes(2); expect(browser).toHaveBeenCalledTimes(1);
    }
  });

  it("uses one injected safe reader for discovery, collector, redirect hops, and browser reads", async () => {
    const dependencies = createDefaultProbeDependencies();
    const safeReader = vi.fn();
    let beforeRequest: ((url: URL) => void | Promise<void>) | undefined;
    dependencies.createSafeFetch = vi.fn((options) => { beforeRequest = options.beforeRequest; return safeReader as typeof fetch; });
    dependencies.discover = vi.fn(async () => ({ targetUrl: input.targetUrl, siteKey: input.expectedSiteKey, candidates: [{}], robotsPolicy: {} }));
    dependencies.createCollector = vi.fn(({ fetchImpl }) => ({ renderBrowserHtml: vi.fn(async () => "rendered"), fetchImpl }));
    dependencies.runAdmission = vi.fn(async ({ collector }) => {
      await beforeRequest?.(new URL("https://fixture.example/redirect")); await beforeRequest?.(new URL("https://fixture.example/final")); await collector.renderBrowserHtml("https://fixture.example/");
      return { status: "completed", candidateCount: 1, analyzablePages: 1, excludedPages: 0, distinctContentHashes: 1, rawHttpReads: 0, browserReads: 0, expectedTextMatched: true };
    });

    await expect(runStagingV4AdmissionNoCommerceProbe(input, dependencies)).resolves.toMatchObject({ rawHttpReads: 2, browserReads: 1 });
    expect(dependencies.discover.mock.calls[0]?.[2]).toBe(safeReader);
    expect(dependencies.createCollector.mock.calls[0]?.[0].fetchImpl).toBe(safeReader);
    expect(() => beforeRequest?.(new URL("https://fixture.example/blocked"))).toThrow(/budget/i);
  });

  it("writes exactly one JSON object for both CLI success and failure", async () => {
    const args = ["--target", input.targetUrl, "--expected-site-key", input.expectedSiteKey, "--expected-text", input.expectedText,
      "--expected-analyzable-pages", "1", "--max-reads", "3", "--max-elapsed-ms", "100"];
    const env = { OGC_DEPLOYMENT_PROFILE: "staging", VERCEL_ENV: "preview", COMMERCE_MODE: "test" };
    const success: string[] = [];
    await expect(executeProbeCli(args, env, (line) => success.push(line), probeDependencies())).resolves.toBeUndefined();
    expect(success).toHaveLength(1);
    expect(JSON.parse(success[0]!)).toMatchObject({ ok: true, status: "completed" });

    const failure: string[] = [];
    await expect(executeProbeCli(args, { ...env, DATABASE_URL: "" }, (line) => failure.push(line), probeDependencies())).rejects.toThrow();
    expect(failure).toHaveLength(1);
    expect(JSON.parse(failure[0]!)).toMatchObject({ ok: false });

    const sensitive: string[] = [];
    const broken = probeDependencies();
    broken.discover = vi.fn(async () => { throw new Error(`secret-url-${"x".repeat(2_000)}`); });
    await expect(executeProbeCli(args, env, (line) => sensitive.push(line), broken)).rejects.toThrow();
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0]).toBe('{"ok":false,"error":"probe_failed"}\n');
  });
});

function probeDependencies(override: Record<string, unknown> = {}): StagingV4AdmissionProbeDependencies & { databaseTouch: ReturnType<typeof vi.fn> } {
  const databaseTouch = vi.fn();
  const elapsedMs = typeof override.elapsedMs === "number" ? override.elapsedMs : 0;
  const observedOverride = { ...override };
  delete observedOverride.elapsedMs;
  const observed = {
    status: "completed",
    candidateCount: 1,
    analyzablePages: 1,
    excludedPages: 0,
    distinctContentHashes: 1,
    rawHttpReads: 1,
    browserReads: 0,
    expectedTextMatched: true,
    ...observedOverride
  };
  return {
    databaseTouch,
    nowMs: vi.fn()
      .mockReturnValueOnce(0)
      .mockReturnValue(elapsedMs),
    scheduleTimeout: vi.fn(() => vi.fn()),
    createSafeFetch: vi.fn(() => vi.fn() as unknown as typeof fetch),
    discover: vi.fn(async () => ({ targetUrl: input.targetUrl, siteKey: "portal.example", candidates: [{}], robotsPolicy: {} })),
    createCollector: vi.fn(() => ({})),
    runAdmission: vi.fn(async () => observed)
  } as StagingV4AdmissionProbeDependencies & { databaseTouch: ReturnType<typeof vi.fn> };
}
