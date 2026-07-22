import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReportV4DiagnosisInput } from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { combinedV3ArtifactFixture } from "@/components/combined-artifact-fixtures";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  getConfirmed: vi.fn(),
  resolveRuntime: vi.fn(),
  answerWithSources: vi.fn(),
  fanouts: vi.fn(),
  resolveSnapshot: vi.fn(),
  enhanceDiagnosis: vi.fn(),
  diagnosisProvider: vi.fn(() => ({ id: "diagnosis-provider" })),
  diagnosisBudget: vi.fn(() => ({ maxInputTokens: 1000, maxOutputTokens: 1000 })),
  modelRuntime: vi.fn(() => ({}))
}));

vi.mock("@/db/business-questions", () => ({
  prepareBusinessQuestionCandidates: mocks.prepare,
  confirmBusinessQuestions: mocks.confirm,
  getConfirmedBusinessQuestionSet: mocks.getConfirmed
}));
vi.mock("@/db/public-search-authority", () => ({ getActivePublicSearchSurfaceAuthority: vi.fn() }));
vi.mock("@/public-source-forensics/production-runtime", () => ({
  resolveProductionPublicSearchRuntime: mocks.resolveRuntime,
  resolveGenerativeSearchAnswerProvider: () => ({
    providerId: "fixture",
    model: "fixture-model",
    searchMode: "native_web_search",
    answerWithSources: mocks.answerWithSources
  })
}));
vi.mock("@/report-v4/mimo-provider", () => ({
  createReportV4MimoDiagnosisProvider: mocks.diagnosisProvider,
  buildReportV4MimoDiagnosisTokenBudget: mocks.diagnosisBudget
}));
vi.mock("@/report-v4/model-runtime-config", () => ({ loadReportV4ModelRuntimeConfig: mocks.modelRuntime }));
vi.mock("./report-v4-diagnosis-enhancer", () => ({ enhanceReportV4QuestionDiagnosis: mocks.enhanceDiagnosis }));
vi.mock("./public-source-forensics", () => ({ createPublicSourceQuestionFanouts: mocks.fanouts }));
vi.mock("./public-source-snapshot-resolver", () => ({ resolvePublicSourceSnapshot: mocks.resolveSnapshot }));

import {
  buildFreeTeaserDiagnosisTargetPages,
  generateFreeTeaser,
  parseReadyFreeTeaserCheckpoint,
  type FreeTeaserCheckpointV1
} from "./report-v4-free-teaser";

function questionSet(): ConfirmedBusinessQuestionSet {
  const texts = ["哪些供应商能够提供跨境物流服务？", "哪些供应商适合中国出口企业？", "采购跨境物流服务时应如何比较交付风险？"];
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  return {
    version: "business-questions-v1",
    id: "free-questions",
    revision: 1,
    locale: "zh-CN",
    region: "CN",
    confidence: "high",
    requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile",
    identityExclusions: ["目标品牌"],
    acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: `confirmed-business-question-set-${"d".repeat(64)}`,
    questions: purposes.map((purpose, index) => ({
      purpose,
      generatedText: texts[index]!,
      privateText: texts[index]!,
      neutralPublicText: texts[index]!,
      evidenceUrls: [],
      service: "跨境物流",
      audience: "出口企业",
      marketRegion: "中国",
      edited: false,
      neutralizationVersion: "identity-neutral-v1",
      neutralContentHash: `q${index + 1}`
    })) as unknown as ConfirmedBusinessQuestionSet["questions"]
  };
}

function admission() {
  return {
    snapshot: {
      id: "admission-1",
      reportId: "report-1",
      siteKey: "target.example",
      collectorConfigIdentityHash: "a".repeat(64),
      capturedAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "completed" as const,
      completedAt: new Date("2030-01-01T00:00:01.000Z"),
      contentIdentityHash: "b".repeat(64),
      candidateUrlCount: 1,
      analyzablePageCount: 1,
      excludedPageCount: 0,
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    },
    pages: [{
      id: "target-page-1",
      ordinal: 1,
      normalizedUrl: "https://target.example/service",
      analyzable: true,
      readMode: "direct" as const,
      summary: "目标官网描述跨境物流服务，但没有说明具体路线条件。",
      contentHash: "c".repeat(64),
      exclusionReason: null,
      snapshotId: "admission-1",
      retainedText: null,
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    }]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const questions = questionSet();
  mocks.prepare.mockResolvedValue(questions);
  mocks.confirm.mockResolvedValue(questions);
  mocks.getConfirmed.mockResolvedValue(questions);
  mocks.resolveRuntime.mockResolvedValue({
    authority: { authorityId: "authority-1", surface: { locale: "zh-CN", region: "CN" } },
    adapter: { id: "adapter-1" }
  });
  const canonical = toCanonicalBuyerQuestionSet(questions).questions;
  mocks.fanouts.mockReturnValue(canonical.map(({ id }) => ({
    questionId: id,
    questionSetVersion: "question-set-v1",
    fanoutVersion: "fanout-v1",
    surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "zh-CN", region: "CN" },
    queries: Array.from({ length: 6 }, (_, index) => ({
      id: `${id}-query-${index + 1}`,
      exactQuery: `query ${index + 1}`,
      derivationRuleId: `query-rule-${index + 1}`,
      resultDepth: 3
    })),
    budget: { maxRequests: 1, maxResults: 3, timeoutMs: 30_000, maxCostMicros: 100_000 }
  })));
  mocks.resolveSnapshot.mockImplementation(async (input: { question: { id: string } }) => {
    const index = canonical.findIndex(({ id }) => id === input.question.id);
    const target = index === 0;
    return {
      snapshotId: `snapshot-${index + 1}`,
      observations: [{
        observationId: `observation-${index + 1}`,
        queryId: `query-${index + 1}`,
        exactQuery: `query ${index + 1}`,
        requestedAt: "2030-01-01T00:00:00.000Z",
        completedAt: "2030-01-01T00:00:01.000Z",
        status: "complete",
        usage: { requestCount: 1, resultCount: 2 },
        results: [
          ...(target ? [{ surfaceResultOrder: 1, url: "https://target.example/service", title: "目标品牌", snippet: "跨境物流", displayedHost: "target.example" }] : []),
          { surfaceResultOrder: 2, url: `https://competitor-${index}.example/`, title: `竞品 ${index}`, snippet: "跨境物流", displayedHost: `competitor-${index}.example` }
        ]
      }]
    };
  });
  mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => ({
    questionId: request.questionId,
    answerText: "目标品牌提供跨境物流服务，采购方应核验具体路线条件。",
    sources: [{
      sourceId: "q1-source",
      title: "公开服务页",
      canonicalUrl: "https://public.example/service",
      registrableDomain: "public.example",
      citedText: "公开页面描述跨境物流服务。",
      providerResultOrder: 1
    }],
    refusal: null,
    searchedAt: "2030-01-01T00:00:02.000Z",
    completedAt: "2030-01-01T00:00:03.000Z",
    providerResponseId: "response-1"
  }));
  mocks.enhanceDiagnosis.mockImplementation(async (input: { question: { questionId: string; sources: Array<{ sourceId: string }> }; targetPages: Array<{ sourceLocations: Array<{ locationId: string }> }> }) => {
    const sourceId = input.question.sources[0]!.sourceId;
    const targetRef = input.targetPages[0]!.sourceLocations[0]!.locationId;
    return {
      status: "completed",
      diagnosis: {
        selectionSummary: "来源与目标页提供了可直接比较的公开事实。",
        observableFactors: [
          { kind: "problem_match", observation: "来源直接回答本题。", evidenceRefs: [sourceId] },
          { kind: "factual_specificity", observation: "来源包含具体服务事实。", evidenceRefs: [sourceId] },
          { kind: "target_clarity", observation: "目标页缺少路线条件。", evidenceRefs: [targetRef] }
        ],
        targetGap: "目标官网没有清楚说明路线条件。",
        recommendedActions: [
          { priority: 1, action: "在服务页补充路线条件。", evidenceRefs: [targetRef] },
          { priority: 2, action: "把服务能力与买家问题对应起来。", evidenceRefs: [sourceId, targetRef] },
          { priority: 3, action: "持续维护可核验的公开事实。", evidenceRefs: [targetRef] }
        ],
        detailedEvidenceRefs: [sourceId, targetRef]
      }
    };
  });
});

describe("free teaser orchestration", () => {
  it("resolves the three public-search snapshots in ordinal order with one question active at a time", async () => {
    const original = mocks.resolveSnapshot.getMockImplementation()!;
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    mocks.resolveSnapshot.mockImplementation(async (input) => {
      const result = await original(input);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return result;
    });
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: vi.fn()
    };
    const pending = generateFreeTeaser(input);

    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(1));
    releases.shift()!();
    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(2));
    releases.shift()!();
    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3));
    releases.shift()!();
    await pending;

    expect(maxActive).toBe(1);
    expect(mocks.resolveSnapshot.mock.calls.map(([request]) => request.question.id)).toEqual(
      toCanonicalBuyerQuestionSet(questionSet()).questions.map(({ id }) => id)
    );
    for (const [request] of mocks.resolveSnapshot.mock.calls) {
      expect(request.searchConcurrency).toBe(1);
      expect(request.fanout.budget.timeoutMs).toBe(60_000);
      expect(request.fanout.queries).toHaveLength(3);
      expect(request.fanout.queries.map(({ derivationRuleId }: { derivationRuleId: string }) => derivationRuleId)).toEqual([
        "query-rule-1", "query-rule-2", "query-rule-3"
      ]);
    }
  });

  it("keeps every answer-card source while bounding diagnosis input to the stable first five", async () => {
    mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => ({
      questionId: request.questionId,
      answerText: "\u8be5\u670d\u52a1\u5546\u516c\u5f00\u63d0\u4f9b\u8de8\u5883\u7269\u6d41\u670d\u52a1\u3002",
      sources: Array.from({ length: 7 }, (_, index) => ({
        sourceId: `q1-source-${index + 1}`,
        title: `\u516c\u5f00\u670d\u52a1\u9875 ${index + 1}`,
        canonicalUrl: `https://public-${index + 1}.example/service`,
        registrableDomain: `public-${index + 1}.example`,
        citedText: `\u516c\u5f00\u8bc1\u636e ${index + 1}`,
        providerResultOrder: index + 1
      })),
      refusal: null,
      searchedAt: "2030-01-01T00:00:02.000Z",
      completedAt: "2030-01-01T00:00:03.000Z",
      providerResponseId: "response-many-sources"
    }));
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: vi.fn()
    };

    const first = await generateFreeTeaser(input);
    const diagnosisQuestion = mocks.enhanceDiagnosis.mock.calls[0]![0].question;
    expect(first.q1AnswerCard.sources.map(({ sourceId }) => sourceId)).toEqual(
      Array.from({ length: 7 }, (_, index) => `q1-source-${index + 1}`)
    );
    expect(diagnosisQuestion.sources.map(({ sourceId }: { sourceId: string }) => sourceId)).toEqual(
      Array.from({ length: 5 }, (_, index) => `q1-source-${index + 1}`)
    );

    await generateFreeTeaser({ ...input, checkpoint: first.checkpoint });
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
  });

  it("checkpoints every expensive stage and resumes a ready teaser without repeating search or model calls", async () => {
    const saved: FreeTeaserCheckpointV1[] = [];
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: {
        ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
        organizationProfile: {
          ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport.organizationProfile,
          organizationName: "目标品牌",
          brandNames: ["目标品牌"],
          legalEntity: null
        }
      },
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: async (checkpoint: FreeTeaserCheckpointV1) => { saved.push(checkpoint); }
    };
    const first = await generateFreeTeaser(input);

    expect(saved.map(({ stage }) => stage)).toEqual(["questions_ready", "observations_ready", "q1_answer_ready", "ready"]);
    expect(first.metrics).toEqual({ questionCount: 3, brandMentionCount: 1, competitorMentionCount: 3 });
    expect(first.q1AnswerCard.diagnosis?.observableFactors).toHaveLength(3);
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
    expect(parseReadyFreeTeaserCheckpoint(first.checkpoint).q1AnswerCard).toEqual(first.q1AnswerCard);

    for (const invalidIdentity of [
      "d".repeat(64),
      `other-question-set-${"d".repeat(64)}`,
      `confirmed-business-question-set-${"d".repeat(63)}`,
      `confirmed-business-question-set-${"D".repeat(64)}`,
      `confirmed-business-question-set-${"g".repeat(64)}`
    ]) {
      expect(() => parseReadyFreeTeaserCheckpoint({
        ...first.checkpoint,
        questionSetIdentity: invalidIdentity
      })).toThrow("Free teaser checkpoint is incomplete.");
    }

    const secondSaved: FreeTeaserCheckpointV1[] = [];
    const second = await generateFreeTeaser({ ...input, checkpoint: first.checkpoint, saveCheckpoint: async (checkpoint) => { secondSaved.push(checkpoint); } });
    expect(second.q1AnswerCard).toEqual(first.q1AnswerCard);
    expect(secondSaved).toEqual([]);
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
  });

  it("binds target evidence locations to the containing question", () => {
    const pages = buildFreeTeaserDiagnosisTargetPages("question-1", admission());
    expect(pages).toHaveLength(1);
    expect(pages[0]!.sourceLocations[0]!.locationId).toMatch(/^question-1:target:[a-f0-9]{64}$/u);
  });

  it("builds target evidence that passes the complete diagnosis-input customer-prose boundary", () => {
    const targetPages = buildFreeTeaserDiagnosisTargetPages("question-1", admission());
    expect(targetPages[0]!.relevanceReason)
      .toBe("The page contains directly verifiable information relevant to this question.");

    expect(() => parseReportV4DiagnosisInput({
      question: { questionId: "question-1", text: "Which service fits this route?" },
      answer: "The available service supports this route under stated conditions.",
      locale: "en",
      sources: [{
        questionId: "question-1",
        sourceId: "source-1",
        title: "Public service page",
        canonicalUrl: "https://public.example/service",
        excerpt: "The public page states the route conditions.",
        retrievalStatus: "available"
      }],
      targetPages
    })).not.toThrow();
  });
});
