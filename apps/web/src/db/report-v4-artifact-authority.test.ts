import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  loadReportV4ArtifactAuthority,
  loadReportV4ArtifactAuthorityInTransaction,
  type ReportV4ArtifactAuthoritySql,
  type ReportV4ArtifactAuthorityTransactionSql
} from "./report-v4-artifact-authority";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";

describe("Report V4 combined-payload artifact authority", () => {
  it("projects exact enhanced content as hashes without raw URL, excerpt, email, or token", async () => {
    const rows = fixture("success", "final");
    const calls: string[] = [];
    const result = await load(rows, "final", calls);
    expect(result.artifacts).toHaveLength(2);
    expect(result.artifacts[1]).toMatchObject({ revisionKind: "diagnosis_enhancement", status: "active" });
    expect(result.artifacts[1]!.diagnosisContentHashes.every(Boolean)).toBe(true);
    expect(result.faultSourceIdHash).toBe(hashText("source-2"));
    expect(result.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(calls.filter((call) => call.startsWith("begin:"))).toEqual(["begin:isolation level repeatable read read only"]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_(URL|EXCERPT|EMAIL|TOKEN)/u);
  });

  it("fails closed for missing, extra, and wrong-topology revisions", async () => {
    const missing = fixture("question_failure", "final");
    missing.artifacts = [];
    await expect(load(missing, "final")).rejects.toThrow(/artifact scope/i);

    const extra = fixture("question_failure", "final");
    extra.artifacts.push({ ...extra.artifacts[0]!, id: "artifact-extra", revision: 2 });
    await expect(load(extra, "final")).rejects.toThrow(/artifact scope/i);

    const baselineEnhancement = fixture("success", "final");
    await expect(load(baselineEnhancement, "baseline")).rejects.toThrow(/forbids enhancement/i);
  });

  it("recomputes canonical identity and rejects stored-hash or payload lineage tampering", async () => {
    const hashTamper = fixture("question_failure", "final");
    hashTamper.artifacts[0]!.payload_identity_hash = "0".repeat(64);
    await expect(load(hashTamper, "final")).rejects.toThrow(/stored payload identity/i);

    const lineageTamper = fixture("question_failure", "final");
    lineageTamper.artifacts[0]!.payload = { ...(lineageTamper.artifacts[0]!.payload as object), reportId: "foreign" };
    await expect(load(lineageTamper, "final")).rejects.toThrow(/payload report identity/i);

    const malformed = fixture("question_failure", "final");
    (malformed.artifacts[0]!.payload as { questions: unknown[] }).questions.push({});
    await expect(load(malformed, "final")).rejects.toThrow(/persisted payload is invalid/i);
  });

  it("rejects parser-normalizable raw payload drift even when the stored hash matches normalized content", async () => {
    const sixthSource = fixture("question_failure", "final");
    const sixthRaw = sixthSource.artifacts[0]!.payload as ReturnType<typeof payload>;
    for (let index = 2; index <= 6; index += 1) {
      sixthRaw.questions[0]!.sources.push({ ...sixthRaw.questions[0]!.sources[0]!,
        sourceId: `source-1-${index}`, canonicalUrl: `https://source-${index}.example/evidence` });
    }
    const fiveSourceNormalized = structuredClone(sixthRaw);
    fiveSourceNormalized.questions[0]!.sources = fiveSourceNormalized.questions[0]!.sources.slice(0, 5);
    sixthSource.artifacts[0]!.payload_identity_hash = hashJson(fiveSourceNormalized);
    await expect(load(sixthSource, "final")).rejects.toThrow(/exact raw persisted JSONB/i);

    const duplicateCanonicalUrl = fixture("question_failure", "final");
    const duplicateRaw = duplicateCanonicalUrl.artifacts[0]!.payload as ReturnType<typeof payload>;
    duplicateRaw.questions[0]!.sources.push({ ...duplicateRaw.questions[0]!.sources[0]!, sourceId: "source-1-alias",
      canonicalUrl: `${duplicateRaw.questions[0]!.sources[0]!.canonicalUrl}#fragment` });
    duplicateCanonicalUrl.artifacts[0]!.payload_identity_hash = hashJson(structuredClone(
      { ...duplicateRaw, questions: duplicateRaw.questions.map((question, index) => index === 0
        ? { ...question, sources: question.sources.slice(0, 1) } : question) }));
    await expect(load(duplicateCanonicalUrl, "final")).rejects.toThrow(/exact raw persisted JSONB/i);

    const duplicateEvidenceRef = fixture("success", "final");
    const diagnosisRaw = (duplicateEvidenceRef.artifacts[1]!.payload as ReturnType<typeof payload>).questions[0]!.diagnosis!;
    diagnosisRaw.observableFactors[0]!.evidenceRefs.push("source-1");
    duplicateEvidenceRef.artifacts[1]!.payload_identity_hash = hashJson(duplicateEvidenceRef.artifacts[1]!.payload);
    await expect(load(duplicateEvidenceRef, "final")).rejects.toThrow(/exact raw persisted JSONB/i);
  });

  it("rejects enhancement drift in answers/sources and diagnosis/checkpoint disagreement", async () => {
    const answerDrift = fixture("success", "final");
    const enhanced = answerDrift.artifacts[1]!.payload as ReturnType<typeof payload>;
    enhanced.questions[0]!.answer = "drift";
    answerDrift.artifacts[1]!.payload_identity_hash = hashJson(enhanced);
    await expect(load(answerDrift, "final")).rejects.toThrow(/drifted core/i);

    const diagnosisDrift = fixture("success", "final");
    diagnosisDrift.checkpoints[0]!.diagnosis_payload = diagnosis("foreign-source");
    diagnosisDrift.checkpoints[0]!.diagnosis_content_hash = hashJson(diagnosisDrift.checkpoints[0]!.diagnosis_payload);
    await expect(load(diagnosisDrift, "final")).rejects.toThrow(/checkpoint.*does not match/i);

    const failedLeak = fixture("diagnosis_failure", "final");
    const failedPayload = failedLeak.artifacts[1]!.payload as ReturnType<typeof payload>;
    failedPayload.questions[1]!.diagnosis = diagnosis("source-2");
    failedLeak.artifacts[1]!.payload_identity_hash = hashJson(failedPayload);
    await expect(load(failedLeak, "final")).rejects.toThrow(/diagnosis checkpoint/i);
  });

  it("locks success and diagnosis-failure checkpoints to the exact fault target", async () => {
    const wrongTarget = fixture("diagnosis_failure", "final");
    wrongTarget.checkpoints[0]!.state = "failed";
    wrongTarget.checkpoints[0]!.diagnosis_payload = null;
    wrongTarget.checkpoints[0]!.diagnosis_content_hash = null;
    wrongTarget.checkpoints[1]!.state = "completed";
    await expect(load(wrongTarget, "final")).rejects.toThrow(/fault target/i);

    const multipleFailed = fixture("diagnosis_failure", "final");
    multipleFailed.checkpoints[0]!.state = "failed";
    multipleFailed.checkpoints[0]!.diagnosis_payload = null;
    multipleFailed.checkpoints[0]!.diagnosis_content_hash = null;
    await expect(load(multipleFailed, "final")).rejects.toThrow(/fault target/i);

    const allCompleted = fixture("diagnosis_failure", "final");
    allCompleted.checkpoints[1]!.state = "completed";
    allCompleted.checkpoints[1]!.diagnosis_payload = diagnosis("source-2");
    allCompleted.checkpoints[1]!.diagnosis_content_hash = hashJson(allCompleted.checkpoints[1]!.diagnosis_payload);
    await expect(load(allCompleted, "final")).rejects.toThrow(/fault target/i);

    const successFailed = fixture("success", "final");
    successFailed.checkpoints[2]!.state = "failed";
    successFailed.checkpoints[2]!.diagnosis_payload = null;
    successFailed.checkpoints[2]!.diagnosis_content_hash = null;
    await expect(load(successFailed, "final")).rejects.toThrow(/fault target/i);
  });

  it("binds the unique success source fault and rejects source-audit/artifact drift", async () => {
    const missingSuccessSource = fixture("success", "final");
    missingSuccessSource.anchor[0]!.fault_source_id = null;
    await expect(load(missingSuccessSource, "final")).rejects.toThrow(/must exist only for the success/i);

    const unexpectedFailureSource = fixture("diagnosis_failure", "final");
    unexpectedFailureSource.anchor[0]!.fault_source_id = "source-2";
    await expect(load(unexpectedFailureSource, "final")).rejects.toThrow(/must exist only for the success/i);

    const wrongTarget = fixture("success", "final");
    wrongTarget.anchor[0]!.fault_source_id = "source-1";
    await expect(load(wrongTarget, "final")).rejects.toThrow(/fault source|exact target source/i);

    const allAvailable = fixture("success", "final");
    allAvailable.checkpoints[1]!.source_audit_payload = [sourceAudit(2, "available")];
    const allAvailablePayload = allAvailable.artifacts[1]!.payload as ReturnType<typeof payload>;
    allAvailablePayload.questions[1]!.sources[0]!.retrievalStatus = "available";
    allAvailable.artifacts[1]!.payload_identity_hash = hashJson(allAvailablePayload);
    await expect(load(allAvailable, "final")).rejects.toThrow(/unique inaccessible/i);

    const multipleInaccessible = fixture("success", "final");
    multipleInaccessible.checkpoints[0]!.source_audit_payload = [sourceAudit(1, "inaccessible")];
    const multiplePayload = multipleInaccessible.artifacts[1]!.payload as ReturnType<typeof payload>;
    multiplePayload.questions[0]!.sources[0]!.retrievalStatus = "inaccessible";
    multipleInaccessible.artifacts[1]!.payload_identity_hash = hashJson(multiplePayload);
    await expect(load(multipleInaccessible, "final")).rejects.toThrow(/unique inaccessible/i);

    const artifactDrift = fixture("success", "final");
    const driftPayload = artifactDrift.artifacts[1]!.payload as ReturnType<typeof payload>;
    driftPayload.questions[1]!.sources[0]!.retrievalStatus = "available";
    artifactDrift.artifacts[1]!.payload_identity_hash = hashJson(driftPayload);
    await expect(load(artifactDrift, "final")).rejects.toThrow(/artifact retrieval lineage/i);

    const nonSuccessDrift = fixture("diagnosis_failure", "final");
    nonSuccessDrift.checkpoints[0]!.source_audit_payload = [sourceAudit(1, "inaccessible")];
    const nonSuccessPayload = nonSuccessDrift.artifacts[1]!.payload as ReturnType<typeof payload>;
    nonSuccessPayload.questions[0]!.sources[0]!.retrievalStatus = "inaccessible";
    nonSuccessDrift.artifacts[1]!.payload_identity_hash = hashJson(nonSuccessPayload);
    await expect(load(nonSuccessDrift, "final")).rejects.toThrow(/non-success.*source-fault audit drift/i);
  });

  it("requires question failure only at the exact target and commits that target to authority", async () => {
    const valid = fixture("question_failure", "final");
    const authority = await load(valid, "final");
    expect(authority.faultQuestionIdHash).toBe(hashText("question-2"));
    expect(authority.faultSourceIdHash).toBeNull();

    const wrong = fixture("question_failure", "final");
    const report = wrong.artifacts[0]!.payload as ReturnType<typeof payload>;
    report.questions[1] = answeredQuestion(2, false);
    report.questions[0] = unavailableQuestion(1);
    wrong.artifacts[0]!.payload_identity_hash = hashJson(report);
    await expect(load(wrong, "final")).rejects.toThrow(/core question status topology/i);
  });

  it("uses a caller-owned transaction without nesting begin", async () => {
    const rows = fixture("question_failure", "final");
    const calls: string[] = [];
    const sql = fakeSql(rows, calls);
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const result = await loadReportV4ArtifactAuthorityInTransaction(tx, { sessionId: SESSION, scenarioId: SCENARIO, phase: "final" });
      expect(result.artifacts).toHaveLength(1);
    });
    expect(calls.filter((call) => call.startsWith("begin:"))).toHaveLength(1);
  });

  it("never selects all columns or secret-bearing persistence fields", async () => {
    const calls: string[] = [];
    await load(fixture("question_failure", "final"), "final", calls);
    const sql = calls.filter((call) => call.startsWith("sql:")).join("\n");
    expect(sql).not.toMatch(/select\s+\*/iu);
    expect(sql).not.toMatch(/customer_email|access_token|pdf_storage_key|canonical_html/iu);
  });
});

type ScenarioKind = "success" | "diagnosis_failure" | "question_failure";
type Fixture = { isolation: Record<string,unknown>[]; anchor: Record<string,unknown>[]; questions: Record<string,unknown>[]; artifacts: Record<string,unknown>[]; checkpoints: Record<string,unknown>[] };

function fixture(kind: ScenarioKind, phase: "baseline" | "final"): Fixture {
  const enhanced = phase === "final" && kind !== "question_failure";
  const corePayload = payload("artifact-core", false);
  if (kind === "question_failure") corePayload.questions[1] = unavailableQuestion(2);
  const enhancementPayload = payload("artifact-enhancement", true, kind === "diagnosis_failure" ? 2 : null,
    kind === "success" ? 2 : null);
  const core = artifact("artifact-core", "core-job", "generation", null, 1, enhanced ? "ready" : "active", corePayload);
  const enhancement = artifact("artifact-enhancement", "enhancement-job", "diagnosis_enhancement", "artifact-core", 2, "active", enhancementPayload);
  return {
    isolation: [{ transaction_isolation: "repeatable read", transaction_read_only: "on", captured_at: new Date("2026-07-17T01:00:00Z") }],
    anchor: [{ session_id: SESSION, scenario_id: SCENARIO, kind, fault_question_id: "question-2",
      fault_source_id: kind === "success" ? "source-2" : null, report_id: "report-1", order_id: "order-1", core_job_id: "core-job",
      enhancement_job_id: enhanced ? "enhancement-job" : null, site_snapshot_id: "snapshot-1", config_snapshot_id: "config-1",
      question_set_id: "questions-1", core_artifact_revision_id: "artifact-core",
      enhancement_artifact_revision_id: enhanced ? "artifact-enhancement" : null,
      report_url: "https://example.test/SECRET_URL", report_locale: "en", active_artifact_revision_id: enhanced ? "artifact-enhancement" : "artifact-core",
      order_report_id: "report-1", order_core_job_id: "core-job", order_site_snapshot_id: "snapshot-1", order_question_set_id: "questions-1",
      product_code: "recommendation_forensics_v1", fulfillment_methodology: "two_stage_geo_report_v4", recommendation_report_version: 4,
      config_report_id: "report-1", config_order_id: "order-1", config_core_job_id: "core-job",
      core_report_id: "report-1", core_site_snapshot_id: "snapshot-1", core_question_set_id: "questions-1",
      core_reason: "standard", core_artifact_contract: "combined_geo_report_v4",
      enhancement_report_id: enhanced ? "report-1" : null, enhancement_question_set_id: enhanced ? "questions-1" : null,
      enhancement_reason: enhanced ? "v4_diagnosis_enhancement" : null, enhancement_artifact_contract: enhanced ? "combined_geo_report_v4" : null,
      question_report_id: "report-1", question_order_id: "order-1", question_set_status: "locked" }],
    questions: [1,2,3].map((ordinal) => ({ id: `question-${ordinal}`, ordinal, question_text: `Question ${ordinal}?` })),
    artifacts: enhanced ? [core, enhancement] : [core],
    checkpoints: enhanced ? [1,2,3].map((ordinal) => {
      const failed = kind === "diagnosis_failure" && ordinal === 2;
      const output = failed ? null : diagnosis(`source-${ordinal}`);
      return { report_id: "report-1", enhancement_job_id: "enhancement-job", core_artifact_revision_id: "artifact-core",
        config_snapshot_id: "config-1", question_set_id: "questions-1", question_id: `question-${ordinal}`, ordinal,
        state: failed ? "failed" : "completed", source_audit_payload: [sourceAudit(ordinal,
          kind === "success" && ordinal === 2 ? "inaccessible" : "available")],
        diagnosis_payload: output, diagnosis_content_hash: output ? hashJson(output) : null };
    }) : []
  };
}

function payload(artifactRevisionId: string, enhanced: boolean, failedOrdinal: number | null = null,
  inaccessibleOrdinal: number | null = null) {
  return { version: 4 as const, artifactContract: "combined_geo_report_v4" as const, reportId: "report-1", artifactRevisionId,
    targetUrl: "https://example.test/SECRET_URL", locale: "en", generatedAt: "2026-07-17T00:00:00.000Z", status: "completed" as const,
    websiteSynthesis: { summary: "Summary", strengths: ["Strength"], gaps: ["Gap"], actions: ["Action"] },
    questions: [1,2,3].map((ordinal) => ({ order: ordinal as 1|2|3, questionId: `question-${ordinal}`, questionText: `Question ${ordinal}?`,
      status: "answered" as const, answer: `Answer ${ordinal} SECRET_EMAIL SECRET_TOKEN`, sources: [{ questionId: `question-${ordinal}`,
        sourceId: `source-${ordinal}`, title: `Title ${ordinal}`, canonicalUrl: `https://example.test/SECRET_URL/source-${ordinal}`,
        citedText: "SECRET_EXCERPT", retrievalStatus: enhanced
          ? ordinal === inaccessibleOrdinal ? "inaccessible" as const : "available" as const
          : "not_checked" as const }],
      ...(enhanced && failedOrdinal !== ordinal ? { diagnosis: diagnosis(`source-${ordinal}`) } : {}) }))
  };
}

function answeredQuestion(ordinal: number, enhanced: boolean) {
  return { order: ordinal as 1|2|3, questionId: `question-${ordinal}`, questionText: `Question ${ordinal}?`,
    status: "answered" as const, answer: `Answer ${ordinal} SECRET_EMAIL SECRET_TOKEN`, sources: [{ questionId: `question-${ordinal}`,
      sourceId: `source-${ordinal}`, title: `Title ${ordinal}`, canonicalUrl: `https://example.test/SECRET_URL/source-${ordinal}`,
      citedText: "SECRET_EXCERPT", retrievalStatus: enhanced ? "available" as const : "not_checked" as const }] };
}

function unavailableQuestion(ordinal: number) {
  return { order: ordinal as 1|2|3, questionId: `question-${ordinal}`, questionText: `Question ${ordinal}?`,
    status: "unavailable" as const, answer: null, sources: [] };
}

function diagnosis(sourceId: string) {
  return { selectionSummary: "Selection", observableFactors: [1,2,3].map((index) => ({ kind: `kind-${index}`, observation: `observation-${index}`, evidenceRefs: [sourceId] })),
    targetGap: "Gap", recommendedActions: [1,2,3].map((priority) => ({ priority, action: `action-${priority}`, evidenceRefs: [sourceId] })), detailedEvidenceRefs: [sourceId] };
}

function sourceAudit(ordinal: number, status: "available" | "inaccessible") {
  return { questionId: `question-${ordinal}`, sourceId: `source-${ordinal}`,
    canonicalUrl: `https://example.test/SECRET_URL/source-${ordinal}`, status,
    ...(status === "available" ? { summary: `Audited ${ordinal}.` } : {}) };
}

function artifact(id: string, job: string, kind: string, source: string | null, revision: number, status: string, report: ReturnType<typeof payload>) {
  return { id, report_id: "report-1", order_id: "order-1", job_id: job, config_snapshot_id: "config-1", source_artifact_revision_id: source,
    revision_kind: kind, revision, artifact_contract: "combined_geo_report_v4", status, payload_identity_hash: hashJson(report),
    payload_artifact_revision_id: id, payload_report_id: "report-1", payload_order_id: "order-1", payload_job_id: job,
    payload_question_set_id: "questions-1", payload: report };
}

async function load(rows: Fixture, phase: "baseline"|"final", calls: string[] = []) {
  return loadReportV4ArtifactAuthority(fakeSql(rows,calls), { sessionId: SESSION, scenarioId: SCENARIO, phase });
}

function fakeSql(rows: Fixture, calls: string[]): ReportV4ArtifactAuthoritySql {
  return { async begin(options, work) {
    calls.push(`begin:${options}`);
    const tx: ReportV4ArtifactAuthorityTransactionSql = { async unsafe(query) {
      calls.push(`sql:${query}`);
      const label = /\/\* authority:([^*]+) \*\//u.exec(query)?.[1];
      calls.push(`query:${label}`);
      if (label === "diagnosis-checkpoints") return rows.checkpoints;
      return rows[label as keyof Fixture] ?? [];
    } };
    return work(tx);
  } };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string,unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(",")}}`;
}
function hashJson(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function hashText(value: string): string { return createHash("sha256").update(value).digest("hex"); }
