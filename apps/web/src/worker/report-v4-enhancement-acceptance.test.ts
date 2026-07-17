import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import { ReportV4AcceptanceIndeterminateOperationError, type ReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";
import type { ReportV4AcceptanceFaultController } from "./report-v4-acceptance-fault-controller";
import { ReportV4DiagnosisProviderError, type ReportV4DiagnosisProvider } from "./report-v4-diagnosis-enhancer";
import { auditReportV4Sources, type ReportV4SourceAuditDependencies } from "./report-v4-source-audit";
import {
  observeReportV4EnhancementActivation,
  observeReportV4EnhancementHtml,
  observeReportV4RecoveredEnhancementActivation,
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
    await expect(observeReportV4EnhancementHtml({
      runtime: null, artifactRevisionId: "enhancement-artifact", render: async () => "<html>original</html>"
    })).resolves.toBe("<html>original</html>");
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
      claimExternalIo: vi.fn(async (event) => { order.push("claim"); return { event, inserted: true } as never; }),
      finishExternalIo: vi.fn(async (event) => { order.push(`finish:${event.phase}`); return { event, inserted: true } as never; })
    });
    const wrapped = withReportV4EnhancementAcceptanceSourceAudit({
      dependencies, runtime, enhancementJobId: "enhancement-job", baselineFingerprint: BASELINE
    });

    await expect(wrapped.readRawSource(answeredQuestion().sources[0]!)).resolves.toMatchObject({ status: "available" });

    expect(order).toEqual(["claim", "raw", "finish:completed"]);
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

  it("observes actual enhancement HTML and activation identities once without URLs or secrets", async () => {
    const runtime = runtimeFor("success");
    const html = "<html><body>Rendered report</body></html>";
    const rendered = await observeReportV4EnhancementHtml({
      runtime, artifactRevisionId: "enhancement-artifact", render: async () => html
    });
    const activate = vi.fn(async () => undefined);
    await observeReportV4EnhancementActivation({
      runtime, artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html), activate
    });

    expect(rendered).toBe(html);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(1, {
      kind: "html_assembly", operation: "enhancement_html", unitId: "enhancement-artifact", attempt: 0,
      phase: "completed", details: { artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html) }
    });
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(2, {
      kind: "artifact_activation", operation: "artifact_activation", unitId: "enhancement-artifact", attempt: 0,
      phase: "observed", details: { artifactRevisionId: "enhancement-artifact", htmlSha256: sha(html) }
    });
    expect(JSON.stringify(vi.mocked(runtime.observer.observe).mock.calls)).not.toMatch(/https?:|secret|token/iu);
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

    expect(runtime.observer.observe).toHaveBeenCalledTimes(2);
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(1, {
      kind: "artifact_activation", operation: "artifact_activation", unitId: "enhancement-artifact", attempt: 0,
      phase: "observed",
      details: { artifactRevisionId: "enhancement-artifact", htmlSha256: "d".repeat(64) }
    });
    expect(runtime.observer.observe).toHaveBeenNthCalledWith(2, vi.mocked(runtime.observer.observe).mock.calls[0]![0]);
  });
});

function runtimeFor(
  kind: "success" | "diagnosis_failure",
  overrides: {
    consume?: ReportV4AcceptanceFaultController["consume"];
    claimExternalIo?: ReportV4AcceptanceObserver["claimExternalIo"];
    finishExternalIo?: ReportV4AcceptanceObserver["finishExternalIo"];
  } = {}
): ReportV4EnhancementAcceptanceRuntime {
  const observer = {
    session: {},
    scenario: { kind } as ReportV4AcceptanceScenario,
    observe: vi.fn(async (event) => ({ event, inserted: true }) as never),
    claimExternalIo: overrides.claimExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never),
    finishExternalIo: overrides.finishExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never)
  } as ReportV4AcceptanceObserver;
  const faultController = {
    mode: "active" as const,
    consume: overrides.consume ?? vi.fn(async () => ({ status: "not_targeted", reason: "question" }))
  } as ReportV4AcceptanceFaultController;
  return { observer, faultController };
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

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
