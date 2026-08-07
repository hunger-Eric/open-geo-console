import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  AiClientError,
  ModelTokenBudgetError
} from "@open-geo-console/ai-report-engine";
import {
  classifyFreeV4DirectProbeFailure,
  createFreeV4DirectProbeQuestionSet,
  FreeV4DirectDiagnosisContractFailure,
  FreeV4DirectReportArtifactFailure,
  FreeV4DirectProbeFailure,
  runFreeV4DirectSemanticsProbe,
  type FreeV4DirectProbeDependencies
} from "./probe-free-v4-direct-semantics";
import type { ReportV4StructuredInvoker } from "@/report-v4/mimo-provider";
import type { ReportV4DiagnosisProviderRequest } from "@/worker/report-v4-diagnosis-enhancer";

describe("Free V4 direct semantics probe", () => {
  it("exposes the exact locked three-question fixture for real isolation diagnostics", () => {
    const set = createFreeV4DirectProbeQuestionSet(new Date("2030-01-01T00:00:00.000Z"));
    expect(set.questions).toHaveLength(3);
    expect(new Set(set.questions.map(({ purpose }) => purpose))).toEqual(new Set([
      "core_service_discovery",
      "customer_region_fit",
      "purchase_delivery_risk"
    ]));
  });

  it("answers and diagnoses all three questions before rendering a production V4 HTML report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ogc-free-direct-"));
    const answerCalls: string[] = [];
    const diagnosisCalls: string[] = [];
    const structuredInvoke = vi.fn(async (request: { inputText: string; systemText: string }) => {
      void request;
      return {
        summary: "Q1 evidence directly supports the answer.",
        observations: ["The retained source describes freight service."],
        recommendations: ["Publish clearer target evidence."],
        evidenceHandles: ["S1", "T1"]
      };
    });
    const result = await runFreeV4DirectSemanticsProbe({
      outputDirectory: directory,
      now: () => new Date("2030-01-01T00:00:00.000Z"),
      dependencies: dependencies({ answerCalls, diagnosisCalls, structuredInvoke })
    });

    expect(result.status).toBe("passed");
    expect(result.completedStages).toEqual(result.callSequence);
    expect(answerCalls).toHaveLength(3);
    expect(diagnosisCalls).toHaveLength(3);
    expect(result.answers).toHaveLength(3);
    expect(result.answers.every(({ status }) => status === "answered")).toBe(true);
    expect(result.diagnoses).toHaveLength(3);
    expect(result.diagnoses.every(({ status }) => status === "completed")).toBe(true);
    expect(result.report.status).toBe("completed");
    expect(result.report.questions.every(({ diagnosis }) => diagnosis)).toBe(true);
    expect(result.modelCallCount).toBe(9);
    expect(result.transportRequestCount).toBe(0);
    expect(result.globalReviewCallCount).toBe(0);
    expect(result.coreReceipt.kind).toBe("core");
    expect(result.analysisReceipt.kind).toBe("analysis");
    const structuredRequest = structuredInvoke.mock.calls.at(0)?.[0];
    expect(structuredRequest).toBeDefined();
    expect(JSON.parse(structuredRequest!.inputText)).toMatchObject({
      targetIdentity: {
        canonicalName: "凌顺速递",
        aliases: ["凌顺速递", "凌顺国际物流", "深圳市凌顺国际物流有限公司"],
        domain: "shun-express.com"
      }
    });

    const persisted = JSON.parse(await readFile(join(directory, "direct-semantics-receipt.json"), "utf8"));
    expect(persisted).toEqual(result);
    const html = await readFile(join(directory, "report.html"), "utf8");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('data-report-stage="enhancement"');
    for (const answer of result.answers) {
      expect(html).toContain(answer.questionText);
      expect(html).toContain(answer.answerText);
    }
  });

  it("persists the exact failing stage without continuing to diagnoses or report rendering", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ogc-free-direct-failure-"));
    const answerCalls: string[] = [];
    const diagnosisCalls: string[] = [];
    const injected = dependencies({ answerCalls, diagnosisCalls, structuredInvoke: vi.fn() });
    injected.answerProvider = {
      providerId: "test-provider",
      model: "test-model",
      searchMode: "native_web_search",
      answerWithSources: vi.fn(async () => {
        throw new AiClientError("provider failed", { code: "temporary_provider", status: 503 });
      })
    };

    let failure: FreeV4DirectProbeFailure | null = null;
    try {
      await runFreeV4DirectSemanticsProbe({
        outputDirectory: directory,
        now: () => new Date("2030-01-01T00:00:00.000Z"),
        dependencies: injected
      });
    } catch (error) {
      failure = error as FreeV4DirectProbeFailure;
    }
    expect(failure).toBeInstanceOf(FreeV4DirectProbeFailure);
    expect(failure?.diagnostic).toMatchObject({
      stage: "question_answers",
      category: "provider_transport",
      code: "temporary_provider",
      httpStatus: 503,
      completedStages: ["site_read", "page_analysis", "website_synthesis"]
    });
    expect(diagnosisCalls).toEqual([]);
    const persisted = JSON.parse(await readFile(join(directory, "direct-semantics-receipt.json"), "utf8"));
    expect(persisted).toMatchObject({ status: "failed", failure: { stage: "question_answers" } });
    expect(persisted.intermediate.pageSummary).toMatchObject({ pageId: "submitted-homepage" });
    expect(persisted.intermediate).not.toHaveProperty("answerResults");
    await expect(readFile(join(directory, "report.html"), "utf8")).rejects.toThrow();
  });

  it.each([
    {
      label: "token budget",
      error: new ModelTokenBudgetError({ accepted: false, code: "max_output_exceeded", estimatedTokens: 5, limitTokens: 4 }),
      expected: { category: "token_budget", code: "max_output_exceeded", httpStatus: null }
    },
    {
      label: "invalid provider response",
      error: new AiClientError("bad response", { code: "invalid_response", status: 200 }),
      expected: { category: "provider_response", code: "invalid_response", httpStatus: 200 }
    },
    {
      label: "provider transport",
      error: new AiClientError("upstream", { code: "temporary_provider", status: 503 }),
      expected: { category: "provider_transport", code: "temporary_provider", httpStatus: 503 }
    },
    {
      label: "timeout",
      error: new AiClientError("timeout", { code: "timeout" }),
      expected: { category: "timeout_or_abort", code: "timeout", httpStatus: null }
    },
    {
      label: "analysis contract",
      error: new TypeError("bad analysis"),
      expected: { category: "contract", code: "invalid_analysis_contract", httpStatus: null }
    },
    {
      label: "diagnosis contract",
      error: new FreeV4DirectDiagnosisContractFailure([]),
      expected: { category: "contract", code: "diagnosis_incomplete", httpStatus: null }
    },
    {
      label: "report HTML content",
      error: new FreeV4DirectReportArtifactFailure("report_html_missing_visible_content", 1, ["answer"]),
      expected: { category: "contract", code: "report_html_missing_visible_content", httpStatus: null }
    },
    {
      label: "site DNS access",
      error: Object.assign(new Error("dns failed"), { name: "UrlSafetyError", code: "dns-resolution-failed" }),
      expected: { category: "site_access", code: "dns-resolution-failed", httpStatus: null }
    }
  ])("classifies $label without provider prose", ({ error, expected }) => {
    expect(classifyFreeV4DirectProbeFailure(error)).toEqual(expected);
  });
});

function dependencies(input: {
  answerCalls: string[];
  diagnosisCalls: string[];
  structuredInvoke: ReportV4StructuredInvoker["invoke"];
}): FreeV4DirectProbeDependencies {
  const pageText = "凌顺速递提供国际集运、跨境专线、仓储、清关和海外末端派送服务。";
  return {
    environment: { NODE_ENV: "test" },
    discoverSite: vi.fn(async () => ({
      targetUrl: "https://shun-express.com/",
      siteKey: "shun-express.com",
      candidates: [],
      deterministicCandidates: [],
      robotsPolicy: {} as never,
      homepage: {} as never,
      estimatedPages: 1
    })),
    fetchEvidencePage: vi.fn(async () => ({
      page: { url: "https://shun-express.com/", pageType: "home" as const, text: pageText },
      httpStatus: 200,
      contentHash: "1".repeat(64),
      browserRendered: false
    })),
    siteSynthesisProvider: {
      analyzePage: vi.fn(async () => ({
        pageId: "submitted-homepage",
        url: "https://shun-express.com/",
        contentHash: "1".repeat(64),
        readability: "direct_readable" as const,
        sourceLength: pageText.length,
        chunks: [{
          order: 1,
          summary: "网站介绍跨境物流与集运服务。",
          sourceLocations: [{ locationId: "target-location-1", startOffset: 0, endOffset: 12 }]
        }]
      })),
      synthesizeWebsite: vi.fn(async () => ({
        summary: "该网站介绍跨境物流服务。",
        strengths: ["服务范围清晰。"],
        gaps: ["公开验证材料有限。"],
        actions: ["补充可核验的服务证据。"]
      }))
    },
    answerProvider: {
      providerId: "test-provider",
      model: "test-model",
      searchMode: "native_web_search",
      answerWithSources: vi.fn(async ({ questionId }: { questionId: string }) => {
        input.answerCalls.push(questionId);
        const ordinal = input.answerCalls.length;
        return {
          questionId,
          answerText: `第 ${ordinal} 个问题的真实结构化回答。`,
          sources: [{
            sourceId: `source-${ordinal}`,
            title: `Provider source ${ordinal}`,
            canonicalUrl: `https://provider-${ordinal}.example/evidence`,
            registrableDomain: `provider-${ordinal}.example`,
            citedText: `Verified source ${ordinal}.`,
            providerResultOrder: 0
          }],
          refusal: null,
          searchedAt: "2030-01-01T00:00:00.000Z",
          completedAt: "2030-01-01T00:00:01.000Z",
          providerResponseId: `response-${ordinal}`
        };
      })
    },
    structuredInvoker: { invoke: input.structuredInvoke },
    diagnosisProvider: {
      generate: vi.fn(async (request: ReportV4DiagnosisProviderRequest) => {
        void request;
        input.diagnosisCalls.push("diagnosis");
        return {
          selectionSummary: "来源能够支持当前回答。",
          observableFactors: [
            { kind: "problem_match", observation: "来源与问题匹配。", evidenceKeys: ["S1"] },
            { kind: "factual_specificity", observation: "来源包含可核验事实。", evidenceKeys: ["S1"] },
            { kind: "target_clarity", observation: "目标页仍需补充同类事实。", evidenceKeys: ["T1"] }
          ],
          targetGap: "目标网站缺少与答案来源同等清晰的公开证据。",
          recommendedActions: [
            { action: "补充服务范围证据。", evidenceKeys: ["T1"] },
            { action: "补充交付条件。", evidenceKeys: ["S1", "T1"] },
            { action: "持续核验页面可访问性。", evidenceKeys: ["S1"] }
          ]
        };
      })
    },
    selectDiagnosisTargetPages: vi.fn(({ questionId }) => [{
      questionId,
      pageId: "submitted-homepage",
      url: "https://shun-express.com/",
      relevanceReason: "The submitted homepage is relevant to this question.",
      summary: "The submitted homepage describes cross-border logistics services.",
      sourceLocations: [{ locationId: "target-location-1", startOffset: 0, endOffset: 12 }]
    }]),
    getDiagnosisTokenBudget: () => ({
      contextWindowTokens: 100_000,
      maxInputTokens: 90_000,
      maxOutputTokens: 5_000,
      estimatedSystemTokens: 100,
      estimatedInputTokens: 1_000,
      reservedOutputTokens: 1_000,
      providerSafetyMarginTokens: 100
    })
  };
}
