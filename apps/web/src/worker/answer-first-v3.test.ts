import type { ProviderDiscoveryV1, RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import { describe, expect, it, vi } from "vitest";
import {
  AnswerFirstV3ResumeIdentityMismatchError,
  buildAnswerFirstV3Evidence,
  resolveAnswerFirstV3,
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
    await expect(resolveAnswerFirstV3({ ...input, client })).rejects.toThrow(/unsupported evidence/i);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
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
