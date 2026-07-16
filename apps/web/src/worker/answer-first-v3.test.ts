import type { GenerativeSearchAnswerProvider, GenerativeSearchAnswerResult, ProviderDiscoveryV1, RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import { describe, expect, it, vi } from "vitest";
import {
  AnswerFirstV3ModelContractInvalidError,
  AnswerFirstV3ResumeIdentityMismatchError,
  buildAnswerFirstV3Evidence,
  resolveAnswerFirstV3,
  resolveGenerativeAnswerFirstV3,
  type AnswerFirstV3StoredSource
} from "./answer-first-v3";

describe("answer-first V3 Worker service", () => {
  it("projects Q1 provider evidence with customer-visible source metadata", () => {
    const input = fixture();
    const evidence = buildAnswerFirstV3Evidence(input);
    const q1 = evidence.filter(({ questionId }) => questionId === questionIds(input.questionSet)[0]);
    expect(q1).toHaveLength(2);
    expect(q1[0]).toMatchObject({
      canonicalUrl: "https://alpha.example/service",
      title: "Alpha service",
      registrableDomain: "alpha.example",
      exactExcerpt: "甲物流提供跨境运输服务。",
      subjectKey: "provider-alpha",
      ownershipCategory: "competitor_owned",
      eligible: true,
      direct: true
    });
  });

  it("projects ordinary eligible direct evidence for Q1 without provider qualification", () => {
    const input = fixture();
    const q1 = questionIds(input.questionSet)[0];
    const ordinarySource = source("source-q1-general", "observation-q1-general", "query-q1-general", "https://public-provider.example/taiwan", "Public provider", "public-provider.example", "该服务商公开提供台湾海运和空运服务。", "earned_editorial");
    const evidence = buildAnswerFirstV3Evidence({
      ...input,
      providerDiscovery: { ...input.providerDiscovery, strict: [], candidates: [], evidence: [] },
      storedSources: [...input.storedSources, ordinarySource],
      forensicReport: {
        ...input.forensicReport,
        fanouts: input.forensicReport.fanouts.map((fanout, index) => index === 0 ? { ...fanout, queries: [{ id: "query-q1-general" }] } : fanout),
        sourceGraph: {
          ...input.forensicReport.sourceGraph,
          evidence: [graphEvidence("graph-q1-general", q1, "query-q1-general", "observation-q1-general", ordinarySource.canonicalUrl, ordinarySource.registrableDomain, ordinarySource.exactExcerpt, "entity-public-provider", "independent_editorial")]
        }
      }
    });

    expect(evidence.filter(({ questionId }) => questionId === q1)).toEqual([
      expect.objectContaining({ subjectKey: "entity-public-provider", canonicalUrl: ordinarySource.canonicalUrl })
    ]);
  });

  it("projects safely retrieved Q1 verification body evidence when provider qualification produced no provider claim", () => {
    const input = fixture();
    const q1 = questionIds(input.questionSet)[0];
    const direct = {
      ...source(
        "source-q1-unqualified",
        "observation-q1-unqualified",
        "query-q1-unqualified",
        "https://winner.example/overseas-warehouse",
        "您的海外仓服务供应商",
        "winner.example",
        "永利八达通拥有100,000 m2海外仓面积，全球多点布局自营仓，并提供一件代发、中转补仓及专业的逆向物流服务。",
        "company_owned"
      ),
      snapshotKind: "candidate_verification" as const
    };

    const evidence = buildAnswerFirstV3Evidence({
      ...input,
      providerDiscovery: { ...input.providerDiscovery, strict: [], candidates: [], evidence: [] },
      storedSources: [direct],
      forensicReport: { ...input.forensicReport, sourceGraph: { ...input.forensicReport.sourceGraph, evidence: [], claims: [], entities: [] } }
    });

    expect(evidence.filter(({ questionId }) => questionId === q1)).toEqual([
      expect.objectContaining({
        canonicalUrl: direct.canonicalUrl,
        subjectKey: "source-domain:winner.example",
        exactExcerpt: expect.stringContaining("100,000 m2海外仓面积")
      })
    ]);
  });

  it("keeps an unqualified but directly supported Q1 answer limited instead of insufficient", async () => {
    const input = fixture();
    const q1 = questionIds(input.questionSet)[0];
    const direct = {
      ...source("source-q1-unqualified", "observation-q1-unqualified", "query-q1-unqualified", "https://winner.example/overseas-warehouse", "您的海外仓服务供应商", "winner.example", "永利八达通提供海外仓一件代发、中转补仓及逆向物流服务。", "company_owned"),
      snapshotKind: "candidate_verification" as const
    };
    const narrowed = {
      ...input,
      providerDiscovery: { ...input.providerDiscovery, strict: [], candidates: [], evidence: [], execution: { ...input.providerDiscovery.execution, coverage: "partial" as const } },
      storedSources: [direct],
      forensicReport: { ...input.forensicReport, sourceGraph: { ...input.forensicReport.sourceGraph, evidence: [], claims: [], entities: [] } }
    };
    const evidence = buildAnswerFirstV3Evidence(narrowed);
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({ modelId: "fixture-model", value: { answers: questionIds(input.questionSet).map((questionId) => ({
        questionId,
        sentences: questionId === q1 ? [{ sentenceId: "sentence-q1", text: "永利八达通公开提供海外仓一件代发、中转补仓及逆向物流服务。", evidenceIds: evidence.map(({ evidenceId }) => evidenceId), confidence: "verified" }] : []
      })) } }))
    };

    const result = await resolveAnswerFirstV3({ ...narrowed, client });

    expect(result.answerCards[0].status).toBe("limited");
    expect(result.answerCards[0].sourceEvidence).toHaveLength(1);
    expect(result.answerCards[0].sentences).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "grounded_claim", confidence: "limited" }),
      expect.objectContaining({ kind: "scope_note" })
    ]));
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("keeps Q2 and Q3 evidence bound to their own question and subject", () => {
    const input = fixture();
    const evidence = buildAnswerFirstV3Evidence(input);
    const ids = questionIds(input.questionSet);
    expect(new Set(evidence.filter(({ questionId }) => questionId === ids[1]).map(({ subjectKey }) => subjectKey))).toEqual(new Set(["entity-region"]));
    expect(new Set(evidence.filter(({ questionId }) => questionId === ids[2]).map(({ subjectKey }) => subjectKey))).toEqual(new Set(["entity-risk"]));
    expect(evidence.some(({ questionId, canonicalUrl }) => questionId === ids[1] && canonicalUrl.includes("risk"))).toBe(false);
  });

  it("synthesizes all three cards in canonical order and checkpoints them", async () => {
    const input = fixture();
    const evidence = buildAnswerFirstV3Evidence(input);
    const saveCheckpoint = vi.fn();
    const client = modelClient(evidence, input.questionSet);
    const result = await resolveAnswerFirstV3({ ...input, client, saveCheckpoint, now: () => new Date("2030-01-02T00:00:00.000Z") });
    expect(result.answerCards.map(({ questionId }) => questionId)).toEqual(questionIds(input.questionSet));
    expect(result.checkpoint.answerCards).toHaveLength(3);
    expect(saveCheckpoint).toHaveBeenCalledOnce();
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("classifies a persistent non-three-entry model response as a V3 model contract error", async () => {
    const input = fixture();
    const client = modelClient(buildAnswerFirstV3Evidence(input), input.questionSet);
    client.completeJson.mockImplementation(async () => ({
      modelId: "fixture-model",
      value: { answers: [] }
    }));

    const result = resolveAnswerFirstV3({ ...input, client });
    await expect(result).rejects.toMatchObject({
      name: "AnswerFirstV3ModelContractInvalidError",
      code: "answer_first_v3_model_contract_invalid",
      classification: "operator_repairable"
    });
    expect(client.completeJson).toHaveBeenCalledTimes(3);
    await expect(result).rejects.toBeInstanceOf(AnswerFirstV3ModelContractInvalidError);
  });

  it("synthesizes a limited answer from one eligible direct source", async () => {
    const base = fixture();
    const input = {
      ...base,
      storedSources: base.storedSources.filter(({ sourceEvidenceId }) => sourceEvidenceId !== "provider-source-b"),
      providerDiscovery: {
        ...base.providerDiscovery,
        strict: base.providerDiscovery.strict.map((provider) => ({ ...provider, evidenceIds: ["provider-evidence-a"] })),
        evidence: base.providerDiscovery.evidence.filter(({ evidenceId }) => evidenceId === "provider-evidence-a")
      }
    };
    const evidence = buildAnswerFirstV3Evidence(input);
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({
        modelId: "fixture-model",
        value: { answers: questionIds(input.questionSet).map((questionId, index) => {
          const scoped = evidence.filter((item) => item.questionId === questionId);
          return {
            questionId,
            sentences: [{ sentenceId: `sentence-${index}`, text: "公开正文提供了与该问题直接相关的信息。", evidenceIds: scoped.map(({ evidenceId }) => evidenceId), confidence: scoped.length >= 2 ? "verified" : "limited" }]
          };
        }) }
      }))
    };

    const result = await resolveAnswerFirstV3({ ...input, client });
    expect(result.answerCards[0]).toMatchObject({ status: "limited", sourceEvidence: [expect.objectContaining({ registrableDomain: "alpha.example" })] });
    expect(result.answerCards[0].sentences.some(({ kind }) => kind === "scope_note")).toBe(true);
  });

  it("localizes internal coverage shortfalls before persisting Chinese answer cards", async () => {
    const base = fixture();
    const input = {
      ...base,
      providerDiscovery: {
        ...base.providerDiscovery,
        strict: [],
        candidates: [],
        evidence: [],
        execution: { ...base.providerDiscovery.execution, coverage: "partial" as const },
        limitation: "Missing public evidence does not prove that a provider lacks a capability."
      },
      storedSources: [],
      forensicReport: {
        ...base.forensicReport,
        coverage: { ...base.forensicReport.coverage, status: "partial" as const, reasons: ["insufficient_question_coverage"] },
        snapshotRefs: base.forensicReport.snapshotRefs.map((snapshot, index) => index === 1 ? {
          ...snapshot,
          observationIds: Array.from({ length: 12 }, (_, observationIndex) => `q2-observation-${observationIndex}`)
        } : snapshot),
        sourceGraph: { ...base.forensicReport.sourceGraph, evidence: [] }
      }
    };
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({
        modelId: "fixture-model",
        value: { answers: questionIds(input.questionSet).map((questionId) => ({ questionId, sentences: [] })) }
      }))
    };

    const result = await resolveAnswerFirstV3({ ...input, client });

    expect(result.answerCards[0].coverage.reasons).toEqual(["公开检索覆盖不足；缺失证据不代表服务商不具备该能力。"]);
    expect(result.answerCards[1].coverage.reasons).toEqual(["该问题的公开检索覆盖不足。"]);
    expect(result.answerCards[2].coverage.reasons).toEqual(["该问题的公开检索覆盖不足。"]);
    expect(result.answerCards[1].coverage.returnedResults).toBe(12);
    expect(result.answerCards[1].coverage).toMatchObject({ attemptedRetrievals: 0, eligibleDirectEvidence: 0 });
  });

  it("rejects unsupported model sentences after one bounded correction", async () => {
    const input = fixture();
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({
        modelId: "fixture-model",
        value: { answers: questionIds(input.questionSet).map((questionId, index) => ({
          questionId,
          sentences: [{ sentenceId: `sentence-${index}`, text: "公开资料显示该结论成立。", evidenceIds: ["invented-evidence"], confidence: "verified" }]
        })) }
      }))
    };
    await expect(resolveAnswerFirstV3({ ...input, client })).rejects.toMatchObject({
      code: "answer_first_v3_model_contract_invalid",
      cause: expect.objectContaining({ message: expect.stringMatching(/unsupported evidence/i) })
    });
    expect(client.completeJson).toHaveBeenCalledTimes(3);
  });

  it("reuses a matching answer checkpoint without search, retrieval, or model calls", async () => {
    const input = fixture();
    const firstClient = modelClient(buildAnswerFirstV3Evidence(input), input.questionSet);
    const first = await resolveAnswerFirstV3({ ...input, client: firstClient });
    const secondClient = { configuredModel: "fixture-model", completeJson: vi.fn() };
    const second = await resolveAnswerFirstV3({ ...input, client: secondClient, checkpoint: first.checkpoint });
    expect(second.reused).toBe(true);
    expect(second.answerCards).toEqual(first.answerCards);
    expect(secondClient.completeJson).not.toHaveBeenCalled();
  });

  it("regenerates a matching legacy checkpoint whose coverage prose fails the report locale", async () => {
    const base = fixture();
    const input = {
      ...base,
      providerDiscovery: { ...base.providerDiscovery, strict: [], candidates: [], evidence: [], execution: { ...base.providerDiscovery.execution, coverage: "partial" as const } },
      storedSources: [],
      forensicReport: { ...base.forensicReport, coverage: { ...base.forensicReport.coverage, status: "partial" as const }, sourceGraph: { ...base.forensicReport.sourceGraph, evidence: [] } }
    };
    const completion = vi.fn(async () => ({
      modelId: "fixture-model",
      value: { answers: questionIds(input.questionSet).map((questionId) => ({ questionId, sentences: [] })) }
    }));
    const first = await resolveAnswerFirstV3({ ...input, client: { configuredModel: "fixture-model", completeJson: completion } });
    const legacy = structuredClone(first.checkpoint);
    legacy.answerCards[0].coverage.reasons = ["Missing public evidence does not prove that a provider lacks a capability."];
    const client = { configuredModel: "fixture-model", completeJson: vi.fn(completion.getMockImplementation()!) };

    const regenerated = await resolveAnswerFirstV3({ ...input, client, checkpoint: legacy });

    expect(regenerated.reused).toBe(false);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("fails closed when evidence or question-set identity changes on resume", async () => {
    const input = fixture();
    const first = await resolveAnswerFirstV3({ ...input, client: modelClient(buildAnswerFirstV3Evidence(input), input.questionSet) });
    const changedSources = input.storedSources.map((source, index) => index === 0 ? { ...source, canonicalUrl: "https://alpha.example/changed-service" } : source);
    await expect(resolveAnswerFirstV3({ ...input, storedSources: changedSources, client: modelClient([], input.questionSet), checkpoint: first.checkpoint }))
      .rejects.toBeInstanceOf(AnswerFirstV3ResumeIdentityMismatchError);
    await expect(resolveAnswerFirstV3({ ...input, questionSet: { ...input.questionSet, contentHash: "changed-questions" }, client: modelClient([], input.questionSet), checkpoint: first.checkpoint }))
      .rejects.toBeInstanceOf(AnswerFirstV3ResumeIdentityMismatchError);
  });
});

describe("generative answer-first V3 Worker service", () => {
  it("collects three answers in canonical order and keeps them when audit retrieval is unavailable", async () => {
    const questionSet = questions();
    const ids = questionIds(questionSet);
    const provider = generativeProvider(ids.map((id, index) => generatedAnswer(id, index)));
    const result = await resolveGenerativeAnswerFirstV3({
      questionSet, provider, locale: "zh-CN", region: "CN", auditSources: []
    });

    expect(provider.answerWithSources.mock.calls.slice(0, 3).map(([request]) => request.questionId)).toEqual(ids);
    expect(result.answerCards.map(({ answerText }) => answerText)).toEqual([
      "服务商甲提供跨境海运服务。",
      "海运适合大件货物，空运适合高时效货物。",
      "采购时应核验服务范围、时效、赔付与禁运限制。"
    ]);
    expect(result.answerCards.every(({ status }) => status === "answered")).toBe(true);
    expect(result.answerCards.every(({ audit }) => audit.searchSourceOnlyCount === 1)).toBe(true);
  });

  it("runs one source correction and degrades to source_limited without erasing the answer", async () => {
    const questionSet = questions();
    const ids = questionIds(questionSet);
    const provider = generativeProvider([
      generatedAnswer(ids[0], 0),
      { ...generatedAnswer(ids[1], 1), sources: [] },
      generatedAnswer(ids[2], 2),
      { ...generatedAnswer(ids[1], 1), answerText: "空运适合高时效货物，海运适合大件货物。", sources: [] }
    ]);

    const result = await resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN", auditSources: [] });

    expect(provider.answerWithSources.mock.calls.filter(([request]) => request.questionId === ids[1])).toHaveLength(2);
    expect(result.answerCards[1]).toMatchObject({ status: "source_limited", answerText: "空运适合高时效货物，海运适合大件货物。", sources: [] });
  });

  it("keeps the original ordinary answer when a source correction is refused", async () => {
    const questionSet = questions(); const ids = questionIds(questionSet);
    const original = { ...generatedAnswer(ids[1], 1), sources: [] };
    const correctionRefusal = { ...original, answerText: "", refusal: { code: "policy_refusal" as const, reason: "服务商拒绝补充来源。" } };
    const provider = generativeProvider([generatedAnswer(ids[0], 0), original, generatedAnswer(ids[2], 2), correctionRefusal]);
    const result = await resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN", auditSources: [] });
    expect(result.answerCards[1]).toMatchObject({ status: "source_limited", answerText: original.answerText, refusal: null });
  });

  it("turns only a typed refusal into refused and propagates transport errors", async () => {
    const questionSet = questions();
    const ids = questionIds(questionSet);
    const refused = { ...generatedAnswer(ids[1], 1), answerText: "", sources: [], refusal: { code: "policy_refusal" as const, reason: "服务提供者拒绝回答该问题。" } };
    const provider = generativeProvider([generatedAnswer(ids[0], 0), refused, generatedAnswer(ids[2], 2)]);
    const result = await resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN", auditSources: [] });
    expect(result.answerCards[1]).toMatchObject({ status: "refused", refusal: { code: "policy_refusal" } });
    expect(provider.answerWithSources.mock.calls.filter(([request]) => request.questionId === ids[1])).toHaveLength(1);

    const failure = new Error("provider unavailable");
    const broken = { providerId: "fixture", model: "fixture-model", searchMode: "native_web_search", answerWithSources: vi.fn(async () => { throw failure; }) } satisfies GenerativeSearchAnswerProvider;
    await expect(resolveGenerativeAnswerFirstV3({ questionSet, provider: broken, locale: "zh-CN", region: "CN", auditSources: [] })).rejects.toBe(failure);
  });

  it("keeps provider answer identity stable across audit enrichment and resumes with zero provider calls", async () => {
    const questionSet = questions();
    const ids = questionIds(questionSet);
    const provider = generativeProvider(ids.map((id, index) => generatedAnswer(id, index)));
    const collected = await resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN" });
    const audit = ids.map((id, index) => source(`audit-${index}`, `observation-${index}`, `query-${index}`, `https://${id}.example/service`, "来源", `${id}.example`, "已独立检索正文。", index === 0 ? "institution" : "earned_editorial"));
    const enriched = await resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN", auditSources: audit, checkpoint: collected.checkpoint });

    expect(provider.answerWithSources).toHaveBeenCalledTimes(3);
    expect(enriched.checkpoint.answerHash).toBe(collected.checkpoint.answerHash);
    expect(enriched.checkpoint.sourceHash).toBe(collected.checkpoint.sourceHash);
    expect(enriched.answerCards.map(({ answerText }) => answerText)).toEqual(collected.answerCards.map(({ answerText }) => answerText));
    expect(enriched.answerCards[0].sources[0]).toMatchObject({ retrievalStatus: "verified_body", ownershipCategory: "institution" });

    const resumedProvider = generativeProvider([]);
    const resumed = await resolveGenerativeAnswerFirstV3({ questionSet, provider: resumedProvider, locale: "zh-CN", region: "CN", auditSources: audit, checkpoint: enriched.checkpoint });
    expect(resumedProvider.answerWithSources).not.toHaveBeenCalled();
    expect(resumed.answerCards).toEqual(enriched.answerCards);
  });

  it("rejects market-statistic-only Q1 after one bounded semantic correction", async () => {
    const questionSet = questions();
    const ids = questionIds(questionSet);
    const statistic = { ...generatedAnswer(ids[0], 0), answerText: "该市场规模达到一千亿元，同比增长百分之十。" };
    const provider = generativeProvider([statistic, generatedAnswer(ids[1], 1), generatedAnswer(ids[2], 2), statistic]);
    await expect(resolveGenerativeAnswerFirstV3({ questionSet, provider, locale: "zh-CN", region: "CN", auditSources: [] }))
      .rejects.toMatchObject({ code: "answer_first_v3_model_contract_invalid" });
    expect(provider.answerWithSources.mock.calls.filter(([request]) => request.questionId === ids[0])).toHaveLength(2);
  });
});

function generatedAnswer(questionId: string, index: number): GenerativeSearchAnswerResult {
  const answers = [
    "服务商甲提供跨境海运服务。",
    "海运适合大件货物，空运适合高时效货物。",
    "采购时应核验服务范围、时效、赔付与禁运限制。"
  ];
  return {
    questionId,
    answerText: answers[index]!,
    sources: [{
      sourceId: `source-${index}`,
      title: `来源${index + 1}`,
      canonicalUrl: `https://${questionId}.example/service`,
      registrableDomain: `${questionId}.example`,
      citedText: null,
      providerResultOrder: 1
    }],
    refusal: null,
    searchedAt: `2030-01-01T00:00:0${index}.000Z`,
    completedAt: `2030-01-01T00:00:1${index}.000Z`,
    providerResponseId: `response-${index}`
  };
}

function generativeProvider(results: GenerativeSearchAnswerResult[]) {
  const queue = [...results];
  type Request = Parameters<GenerativeSearchAnswerProvider["answerWithSources"]>[0];
  return {
    providerId: "fixture",
    model: "fixture-model",
    searchMode: "native_web_search",
    answerWithSources: vi.fn(async (_request: Request) => {
      const next = queue.shift();
      if (!next) throw new Error("Unexpected provider call.");
      return next;
    })
  } satisfies GenerativeSearchAnswerProvider;
}

function modelClient(evidence: ReturnType<typeof buildAnswerFirstV3Evidence>, questionSet: ConfirmedBusinessQuestionSet) {
  return {
    configuredModel: "fixture-model",
    completeJson: vi.fn(async () => ({
      modelId: "fixture-model",
      value: {
        answers: questionIds(questionSet).map((questionId, index) => ({
          questionId,
          sentences: [{
            sentenceId: `sentence-${index}`,
            text: index === 0 ? "公开资料显示，甲物流提供相关运输服务。" : `公开资料显示，该问题已有直接证据支持结论${index + 1}。`,
            evidenceIds: evidence.filter((item) => item.questionId === questionId).map(({ evidenceId }) => evidenceId),
            confidence: "verified"
          }]
        }))
      }
    }))
  };
}

function fixture() {
  const questionSet = questions();
  const ids = questionIds(questionSet);
  const storedSources: AnswerFirstV3StoredSource[] = [
    source("provider-source-a", "provider-observation-a", "provider-query-a", "https://alpha.example/service", "Alpha service", "alpha.example", "甲物流提供跨境运输服务。", "company_owned"),
    source("provider-source-b", "provider-observation-b", "provider-query-b", "https://trade.example/alpha", "Trade review", "trade.example", "行业资料确认甲物流提供跨境运输服务。", "earned_editorial"),
    source("source-q2-a", "observation-q2-a", "query-q2-a", "https://region-a.example/fit", "Region fit A", "region-a.example", "该服务适合目标地区企业。", "earned_editorial"),
    source("source-q2-b", "observation-q2-b", "query-q2-b", "https://region-b.example/fit", "Region fit B", "region-b.example", "目标地区企业可以使用该服务。", "institution"),
    source("source-q3-a", "observation-q3-a", "query-q3-a", "https://risk-a.example/guide", "Risk guide A", "risk-a.example", "采购前需要核验运力与交付条款。", "directory_or_reference"),
    source("source-q3-b", "observation-q3-b", "query-q3-b", "https://risk-b.example/guide", "Risk guide B", "risk-b.example", "合同应明确时效与异常责任。", "institution")
  ];
  const evidence = [
    graphEvidence("graph-q2-a", ids[1], "query-q2-a", "observation-q2-a", "https://region-a.example/fit", "region-a.example", "该服务适合目标地区企业。", "entity-region", "independent_editorial"),
    graphEvidence("graph-q2-b", ids[1], "query-q2-b", "observation-q2-b", "https://region-b.example/fit", "region-b.example", "目标地区企业可以使用该服务。", "entity-region", "public_body"),
    graphEvidence("graph-q3-a", ids[2], "query-q3-a", "observation-q3-a", "https://risk-a.example/guide", "risk-a.example", "采购前需要核验运力与交付条款。", "entity-risk", "directory_or_reference"),
    graphEvidence("graph-q3-b", ids[2], "query-q3-b", "observation-q3-b", "https://risk-b.example/guide", "risk-b.example", "合同应明确时效与异常责任。", "entity-risk", "public_body")
  ];
  return {
    questionSet,
    providerDiscovery: providerDiscovery(),
    forensicReport: {
      locale: "zh-CN",
      region: "CN",
      evidenceCutoffAt: "2030-01-01T23:00:00.000Z",
      questions: toCanonicalBuyerQuestionSet(questionSet),
      fanouts: ids.map((questionId, index) => ({ questionId, queries: index === 0 ? [{ id: "provider-query-a" }, { id: "provider-query-b" }] : [{ id: `query-q${index + 1}-a` }, { id: `query-q${index + 1}-b` }] })),
      snapshotRefs: ids.map((questionId) => ({ questionId, observedAt: "2030-01-01T00:00:00.000Z" })),
      coverage: { status: "complete", completedQueryCount: 6, expectedQueryCount: 6, observedResultCount: 6, surfaceDomainCount: 6, reasons: [] },
      authority: { authorityId: "authority-v3", surface: { surfaceId: "mimo", surfaceVersion: "v1" } },
      sourceGraph: {
        evidence,
        entities: [
          { entityId: "entity-region", canonicalName: "区域服务", status: "resolved" },
          { entityId: "entity-risk", canonicalName: "风险条款", status: "resolved" }
        ],
        claims: []
      }
    } as unknown as RecommendationForensicReportV2,
    storedSources,
    targetUrl: "https://target.example/",
    targetAliases: ["目标品牌"],
    searchSurface: "authority-v3:mimo:v1",
    queryPlanVersion: "provider-query-plan-v1",
    passageSelectorVersion: "provider-passage-selector-v1"
  };
}

function source(sourceEvidenceId: string, observationId: string, queryId: string, canonicalUrl: string, title: string, registrableDomain: string, exactExcerpt: string, sourceCategory: AnswerFirstV3StoredSource["sourceCategory"]): AnswerFirstV3StoredSource {
  return { sourceEvidenceId, observationId, queryId, canonicalUrl, title, registrableDomain, exactExcerpt, sourceCategory, observedAt: "2030-01-01T00:00:00.000Z", retrievalReady: true };
}

function graphEvidence(evidenceId: string, questionId: string, queryVariantId: string, observationId: string, canonicalUrl: string, registrableDomain: string, verifiedExcerpt: string, entityId: string, ownershipCategory: string) {
  return { evidenceId, canonicalUrl, registrableDomain, ownershipCategory, verifiedExcerpt, entityIds: [entityId], queryVariantIds: [queryVariantId], observationRefs: [{ observationId, queryVariantId }], retrievalReadiness: { ready: true }, sourceEligibility: { eligible: true }, directFactSupport: true, metadataOnly: false, contradictory: false, entityAmbiguous: false };
}

function providerDiscovery(): ProviderDiscoveryV1 {
  return {
    version: "provider-discovery-v1",
    policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" },
    identity: { candidateSetHash: "a".repeat(64), queryPlanVersion: "provider-query-plan-v1", passageSelectorVersion: "provider-passage-selector-v1", claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture-model", claimSetHash: "b".repeat(64) },
    execution: { plannedQueries: 2, completedQueries: 2, returnedObservations: 2, safelyRetrievedPages: 2, relevantPassages: 2, discoveredProviders: 1, strictProviders: 1, candidateProviders: 0, rejectedProviders: 0, coverage: "complete" },
    strict: [{ entityId: "provider-alpha", canonicalName: "甲物流", evidenceIds: ["provider-evidence-a", "provider-evidence-b"], capabilities: [] }],
    candidates: [],
    evidence: [
      { evidenceId: "provider-evidence-a", sourceEvidenceId: "provider-source-a", registrableDomain: "alpha.example", title: "Alpha service", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "甲物流提供跨境运输服务。", capability: "linehaul" },
      { evidenceId: "provider-evidence-b", sourceEvidenceId: "provider-source-b", registrableDomain: "trade.example", title: "Trade review", sourceAuthority: "earned_editorial", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "行业资料确认甲物流提供跨境运输服务。", capability: "linehaul" }
    ],
    limitation: "缺失证据不代表缺少能力。"
  } as ProviderDiscoveryV1;
}

function questionIds(set: ConfirmedBusinessQuestionSet): [string, string, string] {
  return toCanonicalBuyerQuestionSet(set).questions.map(({ id }) => id) as [string, string, string];
}

function questions(): ConfirmedBusinessQuestionSet {
  const texts = ["哪些供应商能够提供跨境物流服务？", "哪些供应商适合中国出口企业？", "采购跨境物流服务时应如何比较交付风险？"];
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  return {
    version: "business-questions-v1", id: "questions", revision: 1, locale: "zh-CN", region: "CN", confidence: "high", requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile", identityExclusions: ["目标品牌"], acknowledgedLowConfidence: false, confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "questions-hash",
    questions: purposes.map((purpose, index) => ({ purpose, generatedText: texts[index]!, privateText: texts[index]!, neutralPublicText: texts[index]!, evidenceUrls: [], service: "跨境物流", audience: "出口企业", marketRegion: "中国", edited: false, neutralizationVersion: "identity-neutral-v1", neutralContentHash: `q${index + 1}` })) as unknown as ConfirmedBusinessQuestionSet["questions"]
  };
}
