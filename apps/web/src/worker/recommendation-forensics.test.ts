import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  AnswerEngineRegistry,
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  type AnswerEngineAdapter,
  type AnswerExecutionCheckpoint,
  type AnswerExecutionStateLedger,
  type AnswerSnapshotCell,
  type AnswerSnapshotRunContract
} from "@open-geo-console/answer-engine-observer";
import type { AiWebsiteReportV1, RecommendationForensicReportV1 } from "@open-geo-console/ai-report-engine";
import { runRecommendationForensicsPipeline } from "./recommendation-forensics";

describe("recommendation-forensics Worker pipeline", () => {
  it("qualifies two certified providers and resumes without duplicate provider execution", async () => {
    const persistence = memoryPersistence();
    const adapters = [adapter("provider-a"), adapter("provider-b")];
    const dependencies = deps(adapters, persistence);
    const first = await runRecommendationForensicsPipeline(baseInput(dependencies));
    expect(first.coverage.outcome).toBe("qualified");
    expect(adapters.reduce((sum, item) => sum + vi.mocked(item.observe).mock.calls.length, 0)).toBe(8);
    const second = await runRecommendationForensicsPipeline(baseInput(dependencies));
    expect(second.coverage.outcome).toBe("qualified");
    expect(adapters.reduce((sum, item) => sum + vi.mocked(item.observe).mock.calls.length, 0)).toBe(8);
  });

  it("classifies one usable certified provider as completed-limited", async () => {
    const persistence = memoryPersistence();
    const result = await runRecommendationForensicsPipeline(baseInput(deps([adapter("provider-a")], persistence)));
    expect(result.coverage.outcome).toBe("completed_limited");
  });

  it("classifies an unusable provider as failed and surfaces report-builder validation failure", async () => {
    const persistence = memoryPersistence();
    const broken = adapter("provider-a", true);
    const result = await runRecommendationForensicsPipeline(baseInput(deps([broken], persistence)));
    expect(result.coverage.outcome).toBe("failed");
    await expect(runRecommendationForensicsPipeline(baseInput({
      ...deps([adapter("provider-a")], memoryPersistence()),
      builder: { build: async () => { throw new Error("report validation failed"); } }
    }))).rejects.toThrow("report validation failed");
  });

  it("rejects a CAS race instead of overwriting checkpoint state", async () => {
    const persistence = memoryPersistence();
    persistence.compareAndSwap = async () => { throw new Error("Answer execution checkpoint revision mismatch."); };
    await expect(runRecommendationForensicsPipeline(baseInput(deps([adapter("provider-a")], persistence))))
      .rejects.toThrow(/revision mismatch/i);
  });
});

function deps(adapters: AnswerEngineAdapter[], persistence: ReturnType<typeof memoryPersistence>) {
  const registry = new AnswerEngineRegistry();
  for (const item of adapters) registry.register(item, {
    certifiedAt: "2030-01-01T00:00:00.000Z", environment: "protected_staging", evidenceReference: `evidence/${item.surface.providerId}`
  });
  return {
    adapters,
    certificationAuthority: registry.createCertificationAuthoritySnapshot({ authorityVersion: "cert-v1", capturedAt: "2030-01-01T00:00:00.000Z" }),
    sourceClassificationAuthority: { authorityVersion: "source-v1", capturedAt: "2030-01-01T00:00:00.000Z", context: { customerRegistrableDomain: "customer.example.com", competitorRegistrableDomains: [], knownDomains: {} } },
    builder: { build: async (input: { reportId: string; jobId: string; coverage: unknown }) => ({ reportId: input.reportId, jobId: input.jobId, coverage: input.coverage }) },
    retrieveSource: async () => ({ retrievalState: "available" as const, excerpt: "Provider-returned source evidence.", excerptHash: "excerpt-hash", contentHash: "content-hash" }),
    persistence
  };
}

function baseInput(dependencies: ReturnType<typeof deps>) {
  return { reportId: "report-1", jobId: "job-1", locale: "en" as const, region: "global", targetUrl: "https://customer.example.com/", websiteFoundation: websiteFoundation(), dependencies };
}

function adapter(providerId: string, fail = false): AnswerEngineAdapter {
  const surface = { providerId, productId: "web", modelId: "model", collectionSurface: "developer_api" as const, locale: "en", region: "global", certificationState: "certified" as const };
  return {
    surface,
    observe: vi.fn(async ({ run, question }) => {
      const common = { id: createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface }), runId: run.id, questionId: question.id, surface, executedAt: "2030-01-01T00:00:00.000Z", executionDurationMs: 5 };
      if (fail) return { ...common, status: "failed" as const, errorClass: "policy-blocked" as const };
      const answerText = `Recommended result from ${providerId}.`;
      return { ...common, status: "succeeded" as const, answerText, responseHash: createAnswerResponseHash(answerText), recommendationOutcome: "recommendations_present" as const, sources: [{ url: `https://${providerId}.example.com/source/${question.id}`, title: "Evidence", providerOrder: 0, providerMetadata: {} }] };
    })
  };
}

function memoryPersistence() {
  let run: AnswerSnapshotRunContract | null = null;
  let checkpoint: AnswerExecutionStateLedger | null = null;
  const cells: AnswerSnapshotCell[] = [];
  const evidence = new Set<string>();
  const api = {
    createRun: async (next: AnswerSnapshotRunContract) => { run = next; return next; },
    getBundle: async () => {
      if (!run) return null;
      const storedCells = cells.map((cell) => {
        if (cell.status !== "succeeded") return cell;
        return {
          ...cell,
          sources: cell.sources.map((source) => {
            const id = hash([cell.id, source.url]);
            return {
              ...source,
              id,
              evidence: evidence.has(id) ? { id: hash([id, "evidence-v1"]), sourceId: id } : null
            };
          })
        };
      });
      return { jobId: run.jobId, runs: [{ run, cells: storedCells }] };
    },
    getCheckpoint: async () => checkpoint,
    compareAndSwap: async (next: AnswerExecutionCheckpoint) => { if ((checkpoint?.checkpointRevision ?? 0) !== next.expectedRevision) throw new Error("revision mismatch"); checkpoint = structuredClone(next.executionState); if (next.cell) cells.push(structuredClone(next.cell)); return checkpoint; },
    saveEvidence: async (input: { sourceId: string }) => { evidence.add(input.sourceId); return input; },
    saveReport: async (input: { reportId: string; jobId: string; coverage: { outcome: "qualified" | "completed_limited" | "failed" } }) => ({ reportId: input.reportId, jobId: input.jobId, answerSnapshotMatrix: { commercialCoverage: input.coverage } } as RecommendationForensicReportV1)
  };
  return api;
}

function websiteFoundation(): AiWebsiteReportV1 {
  return { tier: "deep", targetUrl: "https://customer.example.com/", organizationProfile: { organizationName: "Customer Example", brandNames: ["Customer Example"], productsAndServices: ["export market research"], targetAudiences: ["manufacturers"], businessModel: "research service", evidence: [{ url: "https://customer.example.com/", quote: "Export market research for manufacturers." }] } } as AiWebsiteReportV1;
}

function hash(parts: string[]): string {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}
