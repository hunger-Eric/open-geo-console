import { describe, expect, it } from "vitest";
import {
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  createAnswerSnapshotRunId,
  parseAnswerEngineSurface,
  parseAnswerQuestion,
  parseAnswerSnapshotCell,
  parseAnswerSnapshotRun
} from "./index";
import type { AnswerSnapshotCellIdentityInput } from "./index";

const question = {
  id: "market-question-1",
  locale: "en-US",
  category: "category_selection",
  exactText: "Which example service is suitable for a small exporter?",
  inferenceBasis: ["The submitted site describes an exporter-focused service."]
} as const;

const surface = {
  providerId: "fixture-global-a",
  productId: "fixture-search-api",
  modelId: "fixture-model-1",
  collectionSurface: "developer_api",
  locale: "en-US",
  region: "US",
  certificationState: "candidate_uncertified"
} as const;

const source = {
  url: "https://editorial.example.org/review",
  title: "Example service review",
  providerOrder: 0,
  providerMetadata: {
    providerSourceId: "citation-1",
    sourceType: "earned_editorial",
    publishedAt: "2026-07-01T00:00:00.000Z"
  }
};

function successfulCell() {
  return {
    id: createAnswerSnapshotCellId({ runId: "run-1", questionId: question.id, surface }),
    runId: "run-1",
    questionId: question.id,
    surface,
    status: "succeeded",
    answerText: "Atlas Example is one candidate.",
    executedAt: "2026-07-12T08:00:00.000Z",
    executionDurationMs: 125,
    responseHash: createAnswerResponseHash("Atlas Example is one candidate."),
    sources: [source],
    recommendationOutcome: "recommendations_present",
    providerRequestId: "volatile-request-id",
    usage: { inputTokens: 10, outputTokens: 20 }
  } as const;
}

describe("answer observer contracts", () => {
  it("requires complete, non-empty question provenance", () => {
    expect(parseAnswerQuestion(question)).toEqual(question);
    for (const value of [
      { ...question, id: "" },
      { ...question, locale: "" },
      { ...question, exactText: "" },
      { ...question, inferenceBasis: [] },
      { ...question, inferenceBasis: ["  "] },
      { ...question, category: "brand_defense" }
    ]) {
      expect(() => parseAnswerQuestion(value)).toThrow();
    }
  });

  it("preserves the provider, API product, model, region, locale, and collection surface", () => {
    expect(parseAnswerEngineSurface(surface)).toEqual(surface);
  });

  it("binds a valid run to one report, job, locale, region, and question-set version", () => {
    const run = {
      id: "run-1",
      reportId: "report-1",
      jobId: "deep-job-1",
      locale: "en-US",
      region: "US",
      questionSetVersion: "questions-v1",
      startedAt: "2026-07-12T08:00:00.000Z"
    };
    expect(parseAnswerSnapshotRun(run)).toEqual(run);
    for (const key of ["id", "reportId", "jobId", "locale", "region", "questionSetVersion"] as const) {
      expect(() => parseAnswerSnapshotRun({ ...run, [key]: "" })).toThrow();
    }
  });

  it("does not label a developer API as a consumer application", () => {
    expect(() =>
      parseAnswerEngineSurface({ ...surface, consumerApplicationLabel: "Fixture Chat App" })
    ).toThrow(/consumer/i);
  });

  it("requires complete successful observations and normalized sources", () => {
    expect(parseAnswerSnapshotCell(successfulCell())).toEqual(successfulCell());
    for (const key of ["answerText", "executedAt", "responseHash", "sources"] as const) {
      const value = { ...successfulCell() } as Record<string, unknown>;
      delete value[key];
      expect(() => parseAnswerSnapshotCell(value)).toThrow();
    }
  });

  it("requires the response hash to match the normalized answer text", () => {
    expect(() => parseAnswerSnapshotCell({ ...successfulCell(), responseHash: "a".repeat(64) })).toThrow(
      /answerText/i
    );
    expect(
      parseAnswerSnapshotCell({
        ...successfulCell(),
        responseHash: successfulCell().responseHash.toLocaleUpperCase()
      })
    ).toMatchObject({ responseHash: successfulCell().responseHash });
  });

  it("requires bounded failed observations and forbids fabricated success fields", () => {
    const failed = {
      id: createAnswerSnapshotCellId({ runId: "run-1", questionId: question.id, surface }),
      runId: "run-1",
      questionId: question.id,
      surface,
      status: "failed",
      executedAt: "2026-07-12T08:00:00.000Z",
      executionDurationMs: 30000,
      errorClass: "timeout",
      sanitizedError: "The fixture request timed out."
    } as const;
    expect(parseAnswerSnapshotCell(failed)).toEqual(failed);
    expect(() => parseAnswerSnapshotCell({ ...failed, errorClass: "secret-provider-error" })).toThrow();
    expect(() => parseAnswerSnapshotCell({ ...failed, answerText: "Invented answer" })).toThrow();
    expect(() => parseAnswerSnapshotCell({ ...failed, responseHash: "b".repeat(64) })).toThrow();
    for (const sanitizedError of [
      "Authorization: Bearer fixture-token",
      "Bearer fixture-token",
      "api_key=fixture-key",
      "access token: fixture-token",
      "client secret=fixture-secret"
    ]) {
      expect(() => parseAnswerSnapshotCell({ ...failed, sanitizedError })).toThrow(/sensitive/i);
    }
  });

  it("requires non-negative source order and absolute HTTP(S) URLs", () => {
    expect(() =>
      parseAnswerSnapshotCell({ ...successfulCell(), sources: [{ ...source, providerOrder: -1 }] })
    ).toThrow();
    for (const url of ["/relative", "ftp://example.org/file", "javascript:alert(1)"]) {
      expect(() =>
        parseAnswerSnapshotCell({ ...successfulCell(), sources: [{ ...source, url }] })
      ).toThrow();
    }
    expect(() =>
      parseAnswerSnapshotCell({
        ...successfulCell(),
        sources: [{ ...source, providerMetadata: { invalid: () => "not JSON" } }]
      })
    ).toThrow(/metadata/i);
    expect(() =>
      parseAnswerSnapshotCell({
        ...successfulCell(),
        sources: [source, { ...source, url: "https://second.example.org", title: "Second" }]
      })
    ).toThrow(/providerOrder/i);
    expect(() =>
      parseAnswerSnapshotCell({
        ...successfulCell(),
        sources: [source, { ...source, providerOrder: 1, title: "Duplicate URL" }]
      })
    ).toThrow(/unique URLs/i);
    for (const providerMetadata of [
      { supportingExcerpt: "Full answer-supporting text does not belong in source metadata." },
      { fullPageContent: "x".repeat(10_000) },
      { authorization: "Bearer fixture-token" },
      { apiKey: "fixture-key" },
      { providerSourceId: "Bearer fixture-token" },
      { sourceType: "api-key=fixture-key" },
      { providerSourceId: "x".repeat(501) }
    ]) {
      expect(() =>
        parseAnswerSnapshotCell({
          ...successfulCell(),
          sources: [{ ...source, providerMetadata }]
        })
      ).toThrow(/metadata/i);
    }
  });

  it("keeps an explicit no-recommendation answer as a successful observation", () => {
    const answerText = "There is not enough evidence to recommend a supplier.";
    const cell = {
      ...successfulCell(),
      answerText,
      responseHash: createAnswerResponseHash(answerText),
      sources: [],
      recommendationOutcome: "no_recommendation"
    } as const;
    expect(parseAnswerSnapshotCell(cell)).toMatchObject({
      status: "succeeded",
      recommendationOutcome: "no_recommendation"
    });
  });
});

describe("snapshot cell identity", () => {
  const input = { runId: "run-1", questionId: question.id, surface } as const;

  it("is stable for identical normalized identity input", () => {
    expect(createAnswerSnapshotCellId(input)).toBe(createAnswerSnapshotCellId(structuredClone(input)));
  });

  it.each([
    ["run", { ...input, runId: "run-2" }],
    ["question", { ...input, questionId: "market-question-2" }],
    ["provider", { ...input, surface: { ...surface, providerId: "fixture-global-b" } }],
    ["product", { ...input, surface: { ...surface, productId: "fixture-answer-api" } }],
    ["model", { ...input, surface: { ...surface, modelId: "fixture-model-2" } }],
    ["surface", { ...input, surface: { ...surface, collectionSurface: "approved_browser_capture" } }],
    ["locale", { ...input, surface: { ...surface, locale: "zh-CN" } }],
    ["region", { ...input, surface: { ...surface, region: "SG" } }]
  ])("changes when %s identity changes", (_label, changed) => {
    expect(createAnswerSnapshotCellId(changed as AnswerSnapshotCellIdentityInput)).not.toBe(
      createAnswerSnapshotCellId(input)
    );
  });

  it("ignores volatile observation fields", () => {
    const baseline = createAnswerSnapshotCellId({ ...input, providerRequestId: "one", answerText: "A" });
    const changed = createAnswerSnapshotCellId({
      ...input,
      providerRequestId: "two",
      answerText: "B",
      executionDurationMs: 999,
      usage: { outputTokens: 999 }
    });
    expect(changed).toBe(baseline);
  });
});

describe("snapshot run identity", () => {
  const input = {
    reportId: "report-1",
    jobId: "job-1",
    locale: "en-US",
    region: "US",
    questionSetVersion: "v1",
    runKey: "attempt-1"
  };

  it("is deterministic while giving reruns a new identity", () => {
    expect(createAnswerSnapshotRunId(input)).toBe(createAnswerSnapshotRunId({ ...input }));
    expect(createAnswerSnapshotRunId({ ...input, runKey: "attempt-2" })).not.toBe(
      createAnswerSnapshotRunId(input)
    );
  });
});
