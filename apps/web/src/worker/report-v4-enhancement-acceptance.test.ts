import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import type { ReportV4DiagnosisCheckpoint } from "../db/report-v4-diagnosis-checkpoints";
import type { ReportV4AcceptanceSiteReadManifestRepository } from "../db/report-v4-site-read-manifest";
import { ReportV4AcceptanceIndeterminateOperationError, type ReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";
import type { ReportV4AcceptanceFaultController } from "./report-v4-acceptance-fault-controller";
import { ReportV4DiagnosisProviderError, type ReportV4DiagnosisProvider } from "./report-v4-diagnosis-enhancer";
import { auditReportV4Sources, type ReportV4SourceAuditDependencies } from "./report-v4-source-audit";
import {
  observeReportV4EnhancementActivation,
  observeReportV4EnhancementHtmlPersistence,
  observeReportV4RecoveredEnhancementActivation,
  observeReportV4DiagnosisTerminalCheckpoint,
  withReportV4EnhancementAcceptanceDiagnosisProvider,
  withReportV4EnhancementAcceptanceSourceAudit,
  type ReportV4EnhancementAcceptanceRuntime
} from "./report-v4-enhancement-acceptance";

// @requirement GEO-V4-ACCEPT-01

const BASELINE = "b".repeat(64);

describe("Report V4 enhancement acceptance production wrappers", () => {
  it("leaves every dependency on its original path when no acceptance runtime exists", async () => {
    const sourceDependencies = sourceDependenciesFor();
    const provider = providerFor();

    expect(withReportV4EnhancementAcceptanceSourceAudit({
      dependencies: sourceDependencies, runtime: null, enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    })).toBe(sourceDependencies);
    expect(withReportV4EnhancementAcceptanceDiagnosisProvider({
      provider, runtime: null, enhancementJobId: "enhancement-job", questionId: "q1", attempt: 1,
      baselineFingerprint: BASELINE
    })).toBe(provider);
    await expect(observeReportV4EnhancementHtmlPersistence({
      runtime: null, artifactRevisionId: "enhancement-artifact", html: "<html>original</html>",
      persist: async () => ({ htmlSha256: sha("<html>original</html>") })
    })).resolves.toEqual({ htmlSha256: sha("<html>original</html>") });
    const activate = vi.fn(async () => undefined);
    await observeReportV4EnhancementActivation({
      runtime: null, artifactRevisionId: "enhancement-artifact", htmlSha256: sha("<html>original</html>"), activate
    });
    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("consumes the first exact independent-source fault before raw I/O and only marks its audit inaccessible", async () => {
    const dependencies = sourceDependenciesFor();
    const runtime = runtimeFor("success", {
      consume: vi.fn(async () => ({ status: "inject", fault: "independent_source_read_failure", occurrence: 1, event: {} } as never))
    });
    const wrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies, runtime, enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });
    const question = answeredQuestion();

    const [result] = await auditReportV4Sources([question], wrapped);

    expect(result!.question).toBe(question);
    expect(result!.question.answer).toBe("Persisted answer.");
    expect(result!.question.sources[0]!.canonicalUrl).toBe("https://secret.example/source?token=never-store");
    expect(result!.sourceAudits).toEqual([{
      questionId: "q1", sourceId: "source-1", canonicalUrl: question.sources[0]!.canonicalUrl, status: "inaccessible"
    }]);
    expect(runtime.faultController.consume).toHaveBeenCalledExactlyOnceWith({
      jobId: "enhancement-job", questionId: "q1", sourceId: "source-1", occurrence: 1,
      baselineFingerprint: BASELINE
    });
    expect(dependencies.readRawSource).not.toHaveBeenCalled();
    expect(dependencies.renderBrowserSource).not.toHaveBeenCalled();
    expect(runtime.observer.claimExternalIo).not.toHaveBeenCalled();
  });

  it("claims and terminalizes non-injected raw reads without plaintext URLs, and blocks duplicate physical reads", async () => {
    const order: string[] = [];
    const dependencies = sourceDependenciesFor({
      readRawSource: vi.fn(async () => { order.push("raw"); return { status: "available", summary: "Current evidence" }; })
    });
    const runtime = runtimeFor("success", {
      consume: vi.fn(async () => ({ status: "not_targeted", reason: "source" })),
      siteReadManifestRepository: siteReadManifestRepository({
        begin: vi.fn(async input => {
          order.push("manifest:begin");
          return manifestBeginResult(input);
        }),
        terminalize: vi.fn(async input => {
          order.push(`manifest:${input.terminalPhase}`);
          return manifestEntry({ terminalPhase: input.terminalPhase });
        })
      }),
      claimExternalIo: vi.fn(async (event) => { order.push("claim"); return { event, inserted: true } as never; }),
      finishExternalIo: vi.fn(async (event) => { order.push(`finish:${event.phase}`); return { event, inserted: true } as never; })
    });
    const wrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies, runtime, enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });

    await expect(wrapped.readRawSource(answeredQuestion().sources[0]!)).resolves.toMatchObject({ status: "available" });

    expect(order).toEqual(["manifest:begin", "claim", "raw", "manifest:completed", "finish:completed"]);
    expect(runtime.siteReadManifestRepository.begin).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      reportId: "report-1", jobId: "enhancement-job", scope: "enhancement_source", purpose: "source",
      mode: "raw", attempt: 1, ownerQuestionId: "q1", ownerSourceId: "source-1"
    }));
    const started = vi.mocked(runtime.observer.claimExternalIo).mock.calls[0]![0];
    expect(started).toMatchObject({
      kind: "site_read", operation: "site_raw_read", unitId: "enhancement-job:q1:source-1", attempt: 1,
      phase: "started", details: { readMode: "raw", networkPerformed: true }
    });
    expect(started.details.urlHash).toBe(sha("https://secret.example/source?token=never-store"));
    expect(JSON.stringify([started, vi.mocked(runtime.observer.finishExternalIo).mock.calls[0]![0]])).not.toContain("secret.example");
    expect(JSON.stringify([started, vi.mocked(runtime.observer.finishExternalIo).mock.calls[0]![0]])).not.toContain("never-store");

    const duplicateRead = vi.fn(async () => ({ status: "available" as const }));
    const duplicateRuntime = runtimeFor("success", {
      consume: vi.fn(async () => ({ status: "already_consumed", fault: "independent_source_read_failure", occurrence: 1 })),
      claimExternalIo: vi.fn(async () => { throw new ReportV4AcceptanceIndeterminateOperationError(); })
    });
    const duplicate = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies: sourceDependenciesFor({ readRawSource: duplicateRead }), runtime: duplicateRuntime,
      enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });
    await expect(duplicate.readRawSource(answeredQuestion().sources[0]!)).resolves.toEqual({ status: "inaccessible" });
    expect(duplicateRead).not.toHaveBeenCalled();
    expect(duplicateRuntime.observer.claimExternalIo).not.toHaveBeenCalled();
  });

  it("fails closed around manifest begin and terminal writes without claiming, delegating, or inventing observer terminals", async () => {
    const source = answeredQuestion().sources[0]!;
    const beginFailure = new Error("manifest begin failed");
    const beginRead = vi.fn(async () => ({ status: "available" as const }));
    const beginRuntime = runtimeFor("success", {
      siteReadManifestRepository: siteReadManifestRepository({
        begin: vi.fn(async () => { throw beginFailure; })
      })
    });
    const beginWrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies: sourceDependenciesFor({ readRawSource: beginRead }), runtime: beginRuntime,
      enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });

    await expect(beginWrapped.readRawSource(source)).rejects.toBe(beginFailure);
    expect(beginRead).not.toHaveBeenCalled();
    expect(beginRuntime.observer.claimExternalIo).not.toHaveBeenCalled();
    expect(beginRuntime.observer.finishExternalIo).not.toHaveBeenCalled();

    const terminalFailure = new Error("manifest terminal failed");
    const terminalRead = vi.fn(async () => ({ status: "available" as const }));
    const terminalRuntime = runtimeFor("success", {
      siteReadManifestRepository: siteReadManifestRepository({
        terminalize: vi.fn(async () => { throw terminalFailure; })
      })
    });
    const terminalWrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies: sourceDependenciesFor({ readRawSource: terminalRead }), runtime: terminalRuntime,
      enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });

    await expect(terminalWrapped.readRawSource(source)).rejects.toBe(terminalFailure);
    expect(terminalRead).toHaveBeenCalledTimes(1);
    expect(terminalRuntime.observer.claimExternalIo).toHaveBeenCalledTimes(1);
    expect(terminalRuntime.observer.finishExternalIo).not.toHaveBeenCalled();
  });

  it("records a failed manifest before the failed observer terminal when a physical source read fails", async () => {
    const order: string[] = [];
    const physicalFailure = new Error("source read failed");
    const runtime = runtimeFor("success", {
      siteReadManifestRepository: siteReadManifestRepository({
        begin: vi.fn(async input => { order.push("manifest:begin"); return manifestBeginResult(input); }),
        terminalize: vi.fn(async input => {
          order.push(`manifest:${input.terminalPhase}`);
          return manifestEntry({ terminalPhase: input.terminalPhase });
        })
      }),
      claimExternalIo: vi.fn(async event => { order.push("claim"); return { event, inserted: true } as never; }),
      finishExternalIo: vi.fn(async event => { order.push(`finish:${event.phase}`); return { event, inserted: true } as never; })
    });
    const wrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies: sourceDependenciesFor({ readRawSource: vi.fn(async () => {
        order.push("raw");
        throw physicalFailure;
      }) }),
      runtime, enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });

    await expect(wrapped.readRawSource(answeredQuestion().sources[0]!)).rejects.toBe(physicalFailure);
    expect(order).toEqual(["manifest:begin", "claim", "raw", "manifest:failed", "finish:failed"]);
  });

  it("injects two exact diagnosis attempts as retryable failures before provider I/O", async () => {
    const provider = providerFor();
    const runtime = runtimeFor("diagnosis_failure", {
      consume: vi.fn(async (context) => ({
        status: "inject", fault: "diagnosis_failure", occurrence: context.occurrence, event: {}
      } as never))
    });

    for (const attempt of [1, 2] as const) {
      const wrapped = withReportV4EnhancementAcceptanceDiagnosisProvider({
        provider, runtime, enhancementJobId: "enhancement-job", questionId: "q2", attempt,
        baselineFingerprint: BASELINE
      });
      await expect(wrapped.generate(providerRequest())).rejects.toMatchObject({
        code: "temporary_provider", retryable: true
      } satisfies Partial<ReportV4DiagnosisProviderError>);
    }

    expect(runtime.faultController.consume).toHaveBeenNthCalledWith(1, {
      jobId: "enhancement-job", questionId: "q2", occurrence: 1, baselineFingerprint: BASELINE
    });
    expect(runtime.faultController.consume).toHaveBeenNthCalledWith(2, {
      jobId: "enhancement-job", questionId: "q2", occurrence: 2, baselineFingerprint: BASELINE
    });
    expect(provider.generate).not.toHaveBeenCalled();
    expect(runtime.observer.claimExternalIo).not.toHaveBeenCalled();
  });

  it("claims each real diagnosis attempt, records exact zero usage rather than invented vendor usage, and terminalizes failures", async () => {
    const order: string[] = [];
    const providerError = new Error("provider unavailable");
    const provider = providerFor({ generate: vi.fn(async () => { order.push("provider"); throw providerError; }) });
    const runtime = runtimeFor("diagnosis_failure", {
      consume: vi.fn(async () => ({ status: "not_targeted", reason: "question" })),
      claimExternalIo: vi.fn(async (event) => { order.push("claim"); return { event, inserted: true } as never; }),
      finishExternalIo: vi.fn(async (event) => { order.push(`finish:${event.phase}`); return { event, inserted: true } as never; })
    });
    const wrapped = withReportV4EnhancementAcceptanceDiagnosisProvider({
      provider, runtime, enhancementJobId: "enhancement-job", questionId: "q2", attempt: 1,
      baselineFingerprint: BASELINE
    });

    await expect(wrapped.generate(providerRequest())).rejects.toBe(providerError);

    expect(order).toEqual(["claim", "provider", "finish:failed"]);
    expect(runtime.observer.claimExternalIo).toHaveBeenCalledExactlyOnceWith({
      kind: "model_operation", operation: "source_diagnosis", unitId: "enhancement-job:q2", attempt: 1,
      phase: "started",
      details: { providerCall: true, retry: false, budgetOutcome: "allowed", inputTokens: 0, outputTokens: 0 }
    });
    expect(runtime.observer.finishExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      kind: "model_operation", operation: "source_diagnosis", unitId: "enhancement-job:q2", attempt: 1,
      phase: "failed"
    }));

    const duplicateProvider = providerFor();
    const duplicateRuntime = runtimeFor("diagnosis_failure", {
      consume: vi.fn(async () => ({ status: "already_consumed", fault: "diagnosis_failure", occurrence: 1 })),
      claimExternalIo: vi.fn(async () => { throw new ReportV4AcceptanceIndeterminateOperationError(); })
    });
    const duplicate = withReportV4EnhancementAcceptanceDiagnosisProvider({
      provider: duplicateProvider, runtime: duplicateRuntime, enhancementJobId: "enhancement-job",
      questionId: "q2", attempt: 1, baselineFingerprint: BASELINE
    });
    await expect(duplicate.generate(providerRequest())).rejects.toMatchObject({
      code: "temporary_provider", retryable: true
    } satisfies Partial<ReportV4DiagnosisProviderError>);
    expect(duplicateProvider.generate).not.toHaveBeenCalled();
    expect(duplicateRuntime.observer.claimExternalIo).not.toHaveBeenCalled();
  });

  it("observes persisted enhancement HTML pair and activation identities without URLs or secrets", async () => {
    const runtime = runtimeFor("success");
    const html = "<html><body>Rendered report</body></html>";
    const persist = vi.fn(async () => ({ htmlSha256: sha(html) }));
    const persisted = await observeReportV4EnhancementHtmlPersistence({
      runtime, artifactRevisionId: "enhancement-artifact", html, persist
    });
    const activate = vi.fn(async () => undefined);
    await observeReportV4EnhancementActivation({
      runtime, artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html), activate
    });

    expect(persisted.htmlSha256).toBe(sha(html));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(1, {
      kind: "html_assembly", operation: "enhancement_html", unitId: "enhancement-artifact", attempt: 0,
      phase: "started", details: { artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html) }
    });
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(2, {
      kind: "html_assembly", operation: "enhancement_html", unitId: "enhancement-artifact", attempt: 0,
      phase: "completed", details: { artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html) }
    });
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(3, {
      kind: "artifact_activation", operation: "artifact_activation", unitId: "enhancement-artifact", attempt: 0,
      phase: "observed", details: { artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html) }
    });
    expect(JSON.stringify(vi.mocked(runtime.observer.observe).mock.calls)).not.toMatch(/https?:|secret|token/iu);
  });

  it("fails the pair on persist errors or hash mismatch and emits nothing when render fails upstream", async () => {
    const runtime = runtimeFor("success");
    const html = "<html>failure</html>";
    await expect(observeReportV4EnhancementHtmlPersistence({
      runtime, artifactRevisionId: "a", html, persist: async () => { throw new Error("persist failed"); }
    })).rejects.toThrow("persist failed");
    await expect(observeReportV4EnhancementHtmlPersistence({
      runtime, artifactRevisionId: "b", html, persist: async () => ({ htmlSha256: "0".repeat(64) })
    })).rejects.toThrow("hash mismatch");
    expect(vi.mocked(runtime.observer.observe).mock.calls.map(([event]) => [event.unitId, event.phase])).toEqual([
      ["a", "started"], ["a", "failed"], ["b", "started"], ["b", "failed"]
    ]);
    const renderRuntime = runtimeFor("success");
    await expect((async () => { throw new Error("render failed"); })()).rejects.toThrow("render failed");
    expect(renderRuntime.observer.observe).not.toHaveBeenCalled();
  });

  it("does not append failed when completed observation itself fails", async () => {
    const runtime = runtimeFor("success");
    const observe = vi.mocked(runtime.observer.observe);
    observe.mockImplementationOnce(async event => ({ event, inserted: true }) as never)
      .mockImplementationOnce(async () => { throw new Error("observer indeterminate"); });
    const persist = vi.fn(async () => ({ htmlSha256: sha("<html>ok</html>"), payloadIdentityHash: "p" }));
    await expect(observeReportV4EnhancementHtmlPersistence({ runtime, artifactRevisionId: "a", html: "<html>ok</html>", persist })).rejects.toThrow("observer indeterminate");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(observe.mock.calls.map(([event]) => event.phase)).toEqual(["started", "completed"]);
  });

  it("records stable opaque terminal diagnosis checkpoints for completed and failed states", async () => {
    const runtime = runtimeFor("success");
    const completed = diagnosisCheckpoint("completed");
    const failed = diagnosisCheckpoint("failed");
    await observeReportV4DiagnosisTerminalCheckpoint(runtime, completed);
    await observeReportV4DiagnosisTerminalCheckpoint(runtime, completed);
    await observeReportV4DiagnosisTerminalCheckpoint(runtime, failed);
    const events = vi.mocked(runtime.observer.observe).mock.calls.map(([event]) => event);
    expect(events).toHaveLength(3);
    expect(events.map((event) => ({ operation: event.operation, state: event.details.state, unitId: event.unitId }))).toEqual([
      { operation: "source_diagnosis", state: "completed", unitId: completed.identityHash },
      { operation: "source_diagnosis", state: "completed", unitId: completed.identityHash },
      { operation: "source_diagnosis", state: "failed", unitId: failed.identityHash }
    ]);
    expect(events.every((event) => /^[a-f0-9]{64}$/u.test(event.details.checkpointHash))).toBe(true);
    expect(events[0]!.details).toEqual(events[1]!.details);
    expect(JSON.stringify(events)).not.toContain("route conditions");
  });

  it("rejects non-terminal diagnosis checkpoints before observer emission", async () => {
    const runtime = runtimeFor("success");
    const nonTerminal = { ...diagnosisCheckpoint("failed"), state: "queued" } as ReportV4DiagnosisCheckpoint;
    await expect(observeReportV4DiagnosisTerminalCheckpoint(runtime, nonTerminal)).rejects.toThrow(
      "A terminal Report V4 diagnosis checkpoint must be completed or failed."
    );
    expect(runtime.observer.observe).not.toHaveBeenCalled();
  });

  it("idempotently restores the exact activation event on initial active recovery and activation-catch reloads only", async () => {
    const runtime = runtimeFor("success");
    const input = {
      runtime,
      activeArtifactRevisionId: "enhancement-artifact",
      enhancementArtifactRevisionId: "enhancement-artifact",
      htmlSha256: "d".repeat(64)
    };

    await observeReportV4RecoveredEnhancementActivation(input);
    await observeReportV4RecoveredEnhancementActivation(input);
    await observeReportV4RecoveredEnhancementActivation({
      ...input,
      activeArtifactRevisionId: "core-artifact"
    });

    expect(runtime.observer.observe).toHaveBeenCalledTimes(6);
    const events = vi.mocked(runtime.observer.observe).mock.calls.map(([event]) => event);
    expect(events.map(event => event.kind + ":" + event.phase)).toEqual([
      "html_assembly:started", "html_assembly:completed", "artifact_activation:observed",
      "html_assembly:started", "html_assembly:completed", "artifact_activation:observed"
    ]);
    expect(events[0]!.details).toEqual(events[3]!.details);
    expect(events[1]!.details).toEqual(events[4]!.details);
    expect(events[2]!.details).toEqual(events[5]!.details);
  });
});

function runtimeFor(
  kind: "success" | "diagnosis_failure",
  overrides: {
    consume?: ReportV4AcceptanceFaultController["consume"];
    claimExternalIo?: ReportV4AcceptanceObserver["claimExternalIo"];
    finishExternalIo?: ReportV4AcceptanceObserver["finishExternalIo"];
    siteReadManifestRepository?: ReportV4AcceptanceSiteReadManifestRepository;
  } = {}
): ReportV4EnhancementAcceptanceRuntime {
  const observer = {
    session: {
      sessionId: "11111111-1111-4111-8111-111111111111", environment: "protected_staging",
      state: "collecting", terminalAt: null
    },
    scenario: {
      scenarioId: "scenario-1", sessionId: "11111111-1111-4111-8111-111111111111", kind,
      state: "collecting", terminalAt: null, reportId: "report-1", enhancementJobId: "enhancement-job"
    } as ReportV4AcceptanceScenario,
    observe: vi.fn(async (event) => ({ event, inserted: true }) as never),
    claimExternalIo: overrides.claimExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never),
    finishExternalIo: overrides.finishExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never)
  } as ReportV4AcceptanceObserver;
  const faultController = {
    mode: "active" as const,
    consume: overrides.consume ?? vi.fn(async () => ({ status: "not_targeted", reason: "question" }))
  } as ReportV4AcceptanceFaultController;
  return {
    observer,
    faultController,
    siteReadManifestRepository: overrides.siteReadManifestRepository ?? siteReadManifestRepository()
  };
}

function siteReadManifestRepository(
  overrides: Partial<ReportV4AcceptanceSiteReadManifestRepository> = {}
): ReportV4AcceptanceSiteReadManifestRepository {
  return {
    begin: vi.fn(async input => manifestBeginResult(input)),
    terminalize: vi.fn(async input => manifestEntry({ terminalPhase: input.terminalPhase })),
    loadScenarioManifest: vi.fn(async () => []),
    ...overrides
  };
}

function manifestBeginResult(input: { mode: "raw" | "browser" }) {
  return { entry: manifestEntry({ mode: input.mode }), inserted: true } as never;
}

function manifestEntry(overrides: { mode?: "raw" | "browser"; terminalPhase?: "completed" | "failed" } = {}) {
  return {
    identityHash: "a".repeat(64), sessionId: "11111111-1111-4111-8111-111111111111",
    scenarioId: "scenario-1", reportId: "report-1", jobId: "enhancement-job",
    scope: "enhancement_source", purpose: "source", urlHash: "b".repeat(64),
    mode: overrides.mode ?? "raw", attempt: 1, pairBindingHash: "c".repeat(64),
    ownerQuestionId: "q1", ownerSourceId: "source-1", networkPerformed: true,
    terminalPhase: overrides.terminalPhase ?? null, startedAt: new Date("2030-01-01T00:00:00.000Z"),
    terminalAt: overrides.terminalPhase ? new Date("2030-01-01T00:00:01.000Z") : null
  } as never;
}

function sourceDependenciesFor(
  overrides: Partial<ReportV4SourceAuditDependencies> = {}
): ReportV4SourceAuditDependencies {
  return {
    readRawSource: vi.fn(async () => ({ status: "available", summary: "Current evidence" })),
    renderBrowserSource: vi.fn(async () => ({ status: "available", summary: "Rendered evidence" })),
    ...overrides
  };
}

function providerFor(overrides: Partial<ReportV4DiagnosisProvider> = {}): ReportV4DiagnosisProvider {
  return { generate: vi.fn(async () => ({ selectionSummary: "unused" })), ...overrides };
}

function providerRequest() {
  return { kind: "diagnose" as const, input: {} as never, signal: new AbortController().signal };
}

function answeredQuestion() {
  return {
    order: 1 as const,
    questionId: "q1",
    questionText: "Question one?",
    status: "answered" as const,
    answer: "Persisted answer.",
    sources: [{
      questionId: "q1",
      sourceId: "source-1",
      title: "Persisted source",
      canonicalUrl: "https://secret.example/source?token=never-store",
      citedText: "Persisted citation.",
      retrievalStatus: "not_checked" as const
    }]
  };
}

function diagnosisCheckpoint(state: "completed" | "failed"): ReportV4DiagnosisCheckpoint {
  const lineage = { reportId: "report-1", enhancementJobId: "enhancement-1", coreArtifactRevisionId: "artifact-core-1", configSnapshotId: "config-1", questionSetId: "questions-1", snapshotId: "snapshot-1", questionId: "question-1", ordinal: 1 as const };
  const diagnosisInput = { question: { questionId: "question-1", text: "Which service fits this route?" }, answer: "The service supports this route.", locale: "en", sources: [], targetPages: [{ questionId: "question-1", pageId: "page-1", url: "https://target.example/service", relevanceReason: "Relevant", summary: "Summary", sourceLocations: [{ locationId: "loc-1", startOffset: 1, endOffset: 5 }] }] };
  const diagnosis = state === "completed" ? { selectionSummary: "Summary", observableFactors: [{ kind: "problem_match" as const, observation: "Match", evidenceRefs: ["loc-1"] }, { kind: "factual_specificity" as const, observation: "Specific", evidenceRefs: ["loc-1"] }, { kind: "target_clarity" as const, observation: "Clear", evidenceRefs: ["loc-1"] }], targetGap: "Gap", recommendedActions: [{ priority: 1 as const, action: "Act", evidenceRefs: ["loc-1"] }, { priority: 2 as const, action: "Act", evidenceRefs: ["loc-1"] }, { priority: 3 as const, action: "Act", evidenceRefs: ["loc-1"] }], detailedEvidenceRefs: ["loc-1"] } : null;
  const inputIdentityHash = sha(stable(diagnosisInput));
  return { ...lineage, identityHash: sha(stable({ ...lineage, inputIdentityHash })), state, inputIdentityHash, diagnosisInput: diagnosisInput as never, providerCallCount: state === "completed" ? 1 : 2, sourceAudits: [], diagnosis: diagnosis as never, diagnosisContentHash: diagnosis ? sha(stable(diagnosis)) : null };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
