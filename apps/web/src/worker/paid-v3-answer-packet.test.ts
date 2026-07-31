import { describe, expect, it } from "vitest";
import {
  PAID_V3_ANSWER_PACKET_VERSION,
  buildPaidV3AnswerPacketFromGenerativeCard,
  classifyPaidV3PacketError,
  mergePaidV3PacketsByQuestion,
  parsePaidV3AnswerPacket,
  serializePaidV3AnswerPacket,
  shouldRetryPaidV3PacketAttempt,
} from "./paid-v3-answer-packet";

const startedAt = "2026-07-31T00:00:00.000Z";
const completedAt = "2026-07-31T00:01:00.000Z";
const hash = "a".repeat(64);

function card(overrides: Record<string, unknown> = {}) {
  return {
    answerMode: "generative_search_v1" as const,
    questionId: "question-1",
    exactQuestion: "Who provides cross-border logistics?",
    answerText: "Provider Alpha offers linehaul. Provider Beta offers warehousing.",
    status: "answered" as const,
    sources: [
      {
        sourceId: "source-a",
        title: "Alpha",
        canonicalUrl: "https://alpha.example/",
        registrableDomain: "alpha.example",
        citedText: "Alpha offers linehaul.",
        providerResultOrder: 0,
        retrievalStatus: "search_source_only" as const,
        ownershipCategory: "company_owned" as const
      }
    ],
    diagnosis: {
      selectionSummary: "Sources name concrete providers.",
      targetGap: "Target site lacks service detail.",
      observableFactors: [
        { kind: "problem_match" as const, observation: "Provider list is explicit.", evidenceRefs: ["source-a"] },
        { kind: "factual_specificity" as const, observation: "Capabilities are named.", evidenceRefs: ["source-a"] },
        { kind: "entity_clarity" as const, observation: "Entities resolve.", evidenceRefs: ["source-a"] }
      ],
      recommendedActions: [
        { action: "Publish service scope.", evidenceRefs: ["source-a"] },
        { action: "Add delivery conditions.", evidenceRefs: ["source-a"] },
        { action: "Clarify limitations.", evidenceRefs: ["source-a"] }
      ],
      detailedEvidenceRefs: ["source-a"]
    },
    provenance: {
      answerHash: hash,
      sourceHash: hash,
      searchedAt: startedAt,
      completedAt,
      providerResponseId: "resp-1"
    },
    refusal: null,
    ...overrides
  };
}

describe("PaidV3AnswerPacketV1", () => {
  it("builds deterministic serialization for the same card", () => {
    const first = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt
    });
    const second = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt
    });
    expect(first.version).toBe(PAID_V3_ANSWER_PACKET_VERSION);
    expect(serializePaidV3AnswerPacket(first)).toBe(serializePaidV3AnswerPacket(second));
    expect(parsePaidV3AnswerPacket(JSON.parse(serializePaidV3AnswerPacket(first)))).toEqual(first);
  });

  it("rejects oversized answer text", () => {
    expect(() => buildPaidV3AnswerPacketFromGenerativeCard({
      card: card({ answerText: "x".repeat(12_001) }) as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt
    })).toThrow(/answer/i);
  });

  it("rejects foreign source ids against an allowlist dictionary set", () => {
    expect(() => buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt,
      allowedSourceIds: new Set(["other-source"])
    })).toThrow(/foreign/i);
  });

  it("rejects duplicate source ids", () => {
    const packet = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt
    });
    expect(() => parsePaidV3AnswerPacket({
      ...packet,
      sourceIds: ["source-a", "source-a"]
    })).toThrow(/duplicate/i);
  });

  it("merge keeps completed packets and detects identity drift", () => {
    const completed = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      startedAt,
      completedAt
    });
    const failed = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "failed",
      attemptCount: 1,
      providerAttempts: 1,
      startedAt,
      completedAt: completedAt,
      failure: { classification: "contract", retryable: false, reason: "diagnosis incomplete" }
    });
    expect(failed.completedAt).toBeTruthy();
    expect(failed.failureClassification).toBe("contract");
    expect(failed.failureRetryReason).toMatch(/no_retry:diagnosis incomplete/i);
    const map = mergePaidV3PacketsByQuestion(mergePaidV3PacketsByQuestion(undefined, completed), failed);
    expect(map["question-1"]!.status).toBe("completed");
    const drifted = parsePaidV3AnswerPacket({
      ...completed,
      outputHash: "b".repeat(64)
    });
    expect(() => mergePaidV3PacketsByQuestion(map, drifted)).toThrow(/identity drift/i);
    const inputDrift = parsePaidV3AnswerPacket({
      ...completed,
      inputHash: "c".repeat(64)
    });
    expect(() => mergePaidV3PacketsByQuestion(map, inputDrift)).toThrow(/identity drift/i);
  });

  it("keeps Q1 free-reuse packets at zero providerAttempts", () => {
    const freeReuse = buildPaidV3AnswerPacketFromGenerativeCard({
      card: card() as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 0,
      providerAttempts: 0,
      startedAt,
      completedAt
    });
    expect(freeReuse.providerAttempts).toBe(0);
    expect(freeReuse.attemptCount).toBe(0);
    expect(freeReuse.failureClassification).toBeNull();
  });

  it("classifies errors without implying orchestration-layer retries", () => {
    expect(shouldRetryPaidV3PacketAttempt("transient_network", 1)).toBe(false);
    expect(shouldRetryPaidV3PacketAttempt("token_budget", 1)).toBe(false);
    expect(classifyPaidV3PacketError({ name: "ModelTokenBudgetError" })).toEqual({
      classification: "token_budget",
      retryable: false
    });
  });
});
