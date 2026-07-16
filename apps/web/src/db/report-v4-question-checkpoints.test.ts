import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createReportV4QuestionCheckpointRepository,
  type ReportV4QuestionCheckpointSeed,
  type ReportV4QuestionCheckpointSqlExecutor
} from "./report-v4-question-checkpoints";

// @requirement GEO-V4-ANSWER-01
describe("V4 question checkpoint repository", () => {
  it("initializes exactly three independently identified ordered checkpoints through an injected executor", async () => {
    const rows = seeds().map((seed) => dbRow(seed));
    const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
    const executor = fakeExecutor((sql, values) => {
      calls.push({ sql, values });
      return sql.startsWith("INSERT INTO report_v4_question_checkpoints") ? [] : rows;
    });
    const repository = createReportV4QuestionCheckpointRepository(executor);

    const initialized = await repository.initialize({ jobId: "job-1", checkpoints: seeds() });

    expect(initialized.map(({ ordinal, questionId, state }) => ({ ordinal, questionId, state }))).toEqual([
      { ordinal: 1, questionId: "question-1", state: "queued" },
      { ordinal: 2, questionId: "question-2", state: "queued" },
      { ordinal: 3, questionId: "question-3", state: "queued" }
    ]);
    expect(calls.filter(({ sql }) => sql.startsWith("INSERT INTO report_v4_question_checkpoints"))).toHaveLength(3);
    expect(calls.at(-1)?.sql).toContain("ORDER BY ordinal");
  });

  it("rejects missing, extra, duplicate, or out-of-order checkpoint seeds before SQL", async () => {
    let calls = 0;
    const repository = createReportV4QuestionCheckpointRepository(fakeExecutor(() => {
      calls += 1;
      return [];
    }));

    await expect(repository.initialize({ jobId: "job-1", checkpoints: seeds().slice(0, 2) })).rejects.toThrow(/exactly three/i);
    await expect(repository.initialize({ jobId: "job-1", checkpoints: [...seeds(), { ...seeds()[2]!, ordinal: 3 }] })).rejects.toThrow(/exactly three/i);
    await expect(repository.initialize({ jobId: "job-1", checkpoints: [seeds()[0]!, { ...seeds()[1]!, questionId: "question-1" }, seeds()[2]!] })).rejects.toThrow(/unique/i);
    await expect(repository.initialize({ jobId: "job-1", checkpoints: [seeds()[1]!, seeds()[0]!, seeds()[2]!] })).rejects.toThrow(/ordered|ordinal/i);
    expect(calls).toBe(0);
  });

  it("records at most two provider calls and refuses mutation of an answered checkpoint", async () => {
    const seed = seeds()[0]!;
    const answering = dbRow(seed, { state: "answering", provider_call_count: 1 });
    const answered = dbRow(seed, {
      state: "answered",
      provider_call_count: 1,
      answer_payload: { order: 1, questionId: "question-1", questionText: "Question 1?", status: "answered", answer: "Answer 1." },
      source_payload: [source("question-1")],
      answer_content_hash: sha("answer")
    });
    let answerWrites = 0;
    const repository = createReportV4QuestionCheckpointRepository(fakeExecutor((sql) => {
      if (sql.includes("state='answering'")) return [answering];
      if (sql.includes("state='answered'")) {
        answerWrites += 1;
        return answerWrites === 1 ? [answered] : [];
      }
      if (sql.includes("WHERE identity_hash") && sql.startsWith("SELECT")) return [answered];
      return [];
    }));

    await expect(repository.recordProviderCall({ identityHash: seed.identityHash, expectedProviderCallCount: 0 })).resolves.toMatchObject({
      state: "answering",
      providerCallCount: 1
    });
    const saved = await repository.saveAnswered({
      identityHash: seed.identityHash,
      providerCallCount: 1,
      answerPayload: { order: 1, questionId: "question-1", questionText: "Question 1?", status: "answered", answer: "Answer 1." },
      sourcePayload: [source("question-1")],
      answerContentHash: sha("answer")
    });
    expect(saved.state).toBe("answered");
    await expect(repository.saveAnswered({
      identityHash: seed.identityHash,
      providerCallCount: 1,
      answerPayload: { order: 1, questionId: "question-1", questionText: "Question 1?", status: "answered", answer: "Changed." },
      sourcePayload: [source("question-1")],
      answerContentHash: sha("changed")
    })).rejects.toThrow(/immutable/i);
    await expect(repository.recordProviderCall({ identityHash: seed.identityHash, expectedProviderCallCount: 2 })).rejects.toThrow(/two|2|attempt/i);
  });

  it("rejects duplicate source ids or canonical URLs before writing a terminal checkpoint", async () => {
    const seed = seeds()[0]!;
    let sqlCalls = 0;
    const repository = createReportV4QuestionCheckpointRepository(fakeExecutor(() => {
      sqlCalls += 1;
      return [];
    }));
    const answerPayload = { order: 1 as const, questionId: "question-1", questionText: "Question 1?", status: "answered" as const, answer: "Answer 1." };

    await expect(repository.saveAnswered({
      identityHash: seed.identityHash,
      providerCallCount: 1,
      answerPayload,
      sourcePayload: [source("question-1"), { ...source("question-1"), canonicalUrl: "https://other.example/two" }],
      answerContentHash: sha("duplicate-id")
    })).rejects.toThrow(/duplicate|unique.*sourceId/i);
    await expect(repository.saveAnswered({
      identityHash: seed.identityHash,
      providerCallCount: 1,
      answerPayload,
      sourcePayload: [source("question-1"), { ...source("question-1"), sourceId: "question-1:source-2", canonicalUrl: "https://source.example/one#duplicate" }],
      answerContentHash: sha("duplicate-url")
    })).rejects.toThrow(/duplicate|unique.*URL/i);
    expect(sqlCalls).toBe(0);
  });
});

function seeds(): [ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed] {
  return [1, 2, 3].map((ordinal) => ({
    identityHash: sha(`checkpoint-${ordinal}`),
    reportId: "report-1",
    jobId: "job-1",
    questionSetId: "question-set-1",
    questionId: `question-${ordinal}`,
    snapshotId: "snapshot-1",
    ordinal: ordinal as 1 | 2 | 3,
    questionIdentityHash: sha(`question-${ordinal}`),
    modelConfigIdentityHash: sha("model"),
    inputIdentityHash: sha(`input-${ordinal}`)
  })) as [ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed];
}

function dbRow(seed: ReportV4QuestionCheckpointSeed, overrides: Record<string, unknown> = {}) {
  return {
    identity_hash: seed.identityHash,
    report_id: seed.reportId,
    job_id: seed.jobId,
    question_set_id: seed.questionSetId,
    question_id: seed.questionId,
    snapshot_id: seed.snapshotId,
    ordinal: seed.ordinal,
    state: "queued",
    question_identity_hash: seed.questionIdentityHash,
    model_config_identity_hash: seed.modelConfigIdentityHash,
    input_identity_hash: seed.inputIdentityHash,
    provider_call_count: 0,
    answer_payload: null,
    source_payload: [],
    answer_content_hash: null,
    ...overrides
  };
}

function source(questionId: string) {
  return {
    questionId,
    sourceId: `${questionId}:source-1`,
    title: "Source 1",
    canonicalUrl: "https://source.example/one",
    citedText: "Evidence.",
    retrievalStatus: "not_checked"
  };
}

function fakeExecutor(handler: (sql: string, values: readonly unknown[]) => readonly Record<string, unknown>[]): ReportV4QuestionCheckpointSqlExecutor {
  return (async (strings: TemplateStringsArray, ...values: readonly unknown[]) => {
    const sql = strings.join("?").replace(/\s+/gu, " ").trim();
    return handler(sql, values);
  }) as ReportV4QuestionCheckpointSqlExecutor;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
