import { describe, expect, it } from "vitest";
import {
  AiClientError,
  ModelTokenBudgetError,
  PageAnalysisBatchError,
  PageAnalysisContractError,
  ReportLanguageValidationError,
  ReportSemanticReviewEvidenceMissingError,
  SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE
} from "@open-geo-console/ai-report-engine";
import {
  MIMO_CONTENT_FILTERED_CODE,
  MIMO_INVALID_RESPONSE_CODE,
  MIMO_OUTPUT_TRUNCATED_CODE,
  MIMO_TIMEOUT_CODE,
  ReportV4MimoProviderError
} from "../report-v4/mimo-provider";
import { MiMoGenerativeSearchAnswerError } from "../public-search-adapters/mimo/generative-answer";
import { AnswerFirstV3ModelContractInvalidError } from "./answer-first-v3";
import {
  escalateFingerprintRecurrence,
  JobError,
  MIMO_INVALID_RESPONSE_JOB_CODE,
  normalizeJobError,
  PublicSourceQueryVariantCoverageError,
  PublicSourceRuntimeError,
  PublicSourceSnapshotQueryBindingError,
  redactDiagnostic,
  retryDelayMs
} from "./job-errors";
import { ReportV4DiagnosisProviderError } from "./report-v4-diagnosis-enhancer";
import {
  FreeTeaserDiagnosisFailedError,
  FreeTeaserQ1AnnotationDegradedError,
  FreeTeaserQ1IncompleteError
} from "./report-v4-free-teaser";
import { ReportV4QuestionProviderError } from "./report-v4-question-answerer";
import {
  ProviderDiscoveryDeadlineExceededError,
  ProviderDiscoveryPipelineContractError,
  ProviderDiscoveryResumeIdentityMismatchError
} from "./provider-discovery-pipeline";
import { PublicSourceSnapshotUnavailableError } from "./public-source-snapshot-resolver";
import { PublicSourceResumeIdentityMismatchError } from "./public-source-forensics";
import { createPaidV3DiagnosisIncompleteError } from "./processor";

const context = { jobId: "job-1", phase: "public_source_preflight" as const, phaseAttempt: 1, resumeGeneration: 0, configuredSecrets: ["super-secret"] };

describe("job error normalization", () => {
  it("appends only a bounded allowlisted trace without changing the original cause or classification", () => {
    const cause = new Error("original cause");
    const error = new JobError("unchanged", "safe_trace_code", "permanent", { cause, safeDiagnostics: { version: 1, origin: "pre_graph_guard", revision: "a".repeat(40), questions: [{ i: 0, p: 6, ph: "a".repeat(12) }], global: { p0: 6, ph0: "b".repeat(12) }, flags: { d: false, x: true, z: false } } });
    const normalized = normalizeJobError(error, context);
    expect(normalized).toMatchObject({ message: "unchanged", code: "safe_trace_code", classification: "permanent" });
    expect(normalized.causes[0]).toBe("original cause");
    expect(JSON.parse(normalized.causes[1]!.replace("ogc_trace:v1:", ""))).toMatchObject({ o: "pre_graph_guard", r: "a".repeat(40) });
    const oversized = new JobError("unchanged", "safe_trace_code", "permanent", { safeDiagnostics: { ...error.safeDiagnostics!, questions: Array.from({ length: 4 }, () => ({ i: 0 })) } });
    expect(normalizeJobError(oversized, context).causes.some((item) => item.startsWith("ogc_trace:v1:"))).toBe(false);
    const invalid = new JobError("unchanged", "safe_trace_code", "permanent", { safeDiagnostics: { ...error.safeDiagnostics!, global: { p0: 6, raw: "https://must-not-persist.example" } } });
    expect(normalizeJobError(invalid, context).causes.some((item) => item.startsWith("ogc_trace:v1:"))).toBe(false);
    const invalidRevision = new JobError("unchanged", "safe_trace_code", "permanent", { safeDiagnostics: { ...error.safeDiagnostics!, revision: "rev-1" } });
    expect(normalizeJobError(invalidRevision, context)).toMatchObject({ message: "unchanged", code: "safe_trace_code", classification: "permanent", causes: [] });
  });
  it("redacts credentials, URLs and raw IPs before diagnostics persist", () => {
    const error = new Error("Bearer super-secret postgres://alice:password@db.example/app from 203.0.113.42");
    const normalized = normalizeJobError(error, context);
    expect(normalized.message).not.toContain("super-secret");
    expect(normalized.message).not.toContain("postgres://");
    expect(normalized.message).not.toContain("203.0.113.42");
    expect(normalized.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(redactDiagnostic("Cookie=abc")).toContain("[REDACTED]");
  });

  it("normalizes a typed AI provider failure through the page-batch cause chain", () => {
    const provider = new AiClientError("The model returned invalid JSON.", {
      code: "invalid_json", finishReason: "stop", responseChars: 321
    });
    const batch = new Error("The model returned invalid JSON.", { cause: provider });
    batch.name = "PageAnalysisBatchError";

    expect(normalizeJobError(batch, { ...context, phase: "page_analysis" })).toMatchObject({
      code: "ai_client_invalid_response", classification: "transient", type: "PageAnalysisBatchError"
    });
  });

  it("normalizes a typed page-analysis contract rejection without retaining model content", () => {
    const contract = new PageAnalysisContractError(1, 0, [
      { path: "$.analyses[0].summary", reason: "summary_invalid" }
    ]);
    const batch = new PageAnalysisBatchError(contract.message, [], { cause: contract });
    const normalized = normalizeJobError(batch, { ...context, phase: "page_analysis" });

    expect(normalized).toMatchObject({
      code: "page_analysis_contract_invalid",
      classification: "transient",
      type: "PageAnalysisBatchError"
    });
    expect(normalized.message).toContain("$.analyses[0].summary:summary_invalid");
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(JSON.stringify(normalized)).not.toContain("model response body");
    expect(escalateFingerprintRecurrence(normalized)).toMatchObject({
      code: "page_analysis_contract_invalid",
      classification: "permanent",
      retryableAt: null
    });
  });

  it("keeps stable operator-repairable codes and deterministic bounded backoff", () => {
    const normalized = normalizeJobError(new PublicSourceRuntimeError("disabled", "public_source_runtime_disabled"), context, new Date("2030-01-01T00:00:00Z"));
    expect(normalized).toMatchObject({ classification: "operator_repairable", code: "public_source_runtime_disabled", retryableAt: null });
    expect(retryDelayMs(99, "ffff")).toBeLessThanOrEqual(15 * 60_000 + 5_000);
  });

  it("routes an exhausted report-language gate to a transient retry", () => {
    const normalized = normalizeJobError(new ReportLanguageValidationError([
      { path: "executiveSummary.overview", reason: "unexpected_english_sentence" }
    ]), context);
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "report_language_validation_failed"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
  });

  it("preserves the safe public-source stage while redacting the underlying cause", () => {
    const error = new PublicSourceSnapshotUnavailableError(
      "observation_persistence",
      { cause: new Error("Bearer super-secret failed for https://user:pass@example.com/private") }
    );
    const normalized = normalizeJobError(error, context);
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "public_source_snapshot_observation_persistence",
      type: "PublicSourceSnapshotUnavailableError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(JSON.stringify(normalized)).not.toContain("super-secret");
    expect(JSON.stringify(normalized)).not.toContain("user:pass");
  });

  it("records a bounded code for an invalid answer-first V3 model contract", () => {
    const normalized = normalizeJobError(new AnswerFirstV3ModelContractInvalidError({
      cause: new TypeError("Model must return exactly three ordered answer entries.")
    }), context);

    expect(normalized).toMatchObject({
      classification: "transient",
      code: "answer_first_v3_model_contract_invalid",
      type: "AnswerFirstV3ModelContractInvalidError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
  });

  it("persists FreeTeaserDiagnosisFailedError as a durable permanent job code", () => {
    const normalized = normalizeJobError(
      new FreeTeaserDiagnosisFailedError(
        {
          stage: "semantic_contract",
          code: "invalid_semantic_output",
          parserPath: "$diagnosisSemanticOutput.targetGap"
        },
        2
      ),
      { ...context, phase: "grounded_answer_synthesis" }
    );

    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "free_teaser_diagnosis_semantic_contract",
      type: "FreeTeaserDiagnosisFailedError",
      retryableAt: null
    });
    expect(normalized.message).toContain("stage=semantic_contract");
    expect(normalized.code).not.toBe("unexpected_internal_error");
    expect(JSON.stringify(normalized)).not.toMatch(/raw provider|system prompt|evidence prose/i);
  });

  it("persists FreeTeaserQ1IncompleteError as a transient free-teaser job code", () => {
    const normalized = normalizeJobError(
      new FreeTeaserQ1IncompleteError(),
      { ...context, phase: "grounded_answer_synthesis" }
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "free_teaser_q1_incomplete",
      type: "FreeTeaserQ1IncompleteError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(normalized.code).not.toBe("unexpected_internal_error");
  });

  it("persists a degraded Free Q1 review annotation as a transient model-contract failure", () => {
    const normalized = normalizeJobError(
      new FreeTeaserQ1AnnotationDegradedError(),
      { ...context, phase: "grounded_answer_synthesis" }
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "free_teaser_q1_annotation_degraded",
      type: "FreeTeaserQ1AnnotationDegradedError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    // W1 fingerprint recurrence is the deterministic backstop to permanent.
    expect(escalateFingerprintRecurrence(normalized)).toMatchObject({
      classification: "permanent",
      retryableAt: null
    });
  });

  it("classifies a deterministic Paid V3 diagnosis input-validation failure as permanent", () => {
    const normalized = normalizeJobError(
      createPaidV3DiagnosisIncompleteError("question-1", {
        providerAttempts: 0,
        failure: { stage: "input_validation", code: "invalid_input", parserPath: "$diagnosisInput.sources" }
      }),
      { ...context, phase: "grounded_answer_synthesis" }
    );

    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "paid_v3_diagnosis_input_invalid",
      type: "PaidV3DiagnosisIncompleteError",
      retryableAt: null
    });
    expect(normalized.message).toContain("stage=input_validation");
  });

  it("keeps non-input Paid V3 diagnosis failures off the permanent path", () => {
    const normalized = normalizeJobError(
      createPaidV3DiagnosisIncompleteError("question-1", {
        providerAttempts: 1,
        failure: { stage: "provider", code: "provider_timeout", parserPath: null }
      }),
      { ...context, phase: "grounded_answer_synthesis" }
    );

    expect(normalized.classification).not.toBe("permanent");
    expect(normalized.code).not.toBe("paid_v3_diagnosis_input_invalid");
  });

  it.each([
    [{ stage: "token_budget", code: "budget_rejected" }, "paid_v3_diagnosis_token_budget", "permanent", false],
    [{ stage: "semantic_contract", code: "invalid_semantic_output" }, "paid_v3_diagnosis_semantic_contract", "permanent", false],
    [{ stage: "canonical_contract", code: "invalid_legacy_output" }, "paid_v3_diagnosis_canonical_contract", "permanent", false],
    [{ stage: "correction_contract", code: "invalid_correction" }, "paid_v3_diagnosis_correction_contract", "permanent", false],
    [{ stage: "provider", code: "provider_safety" }, "paid_v3_diagnosis_provider_safety", "permanent", false],
    [{ stage: "provider", code: "provider_authentication" }, "paid_v3_diagnosis_provider_authentication", "operator_repairable", false],
    [{ stage: "provider", code: "provider_configuration" }, "paid_v3_diagnosis_provider_configuration", "operator_repairable", false],
    [{ stage: "provider", code: "provider_transport" }, "paid_v3_diagnosis_provider_transport", "transient", true],
    [{ stage: "provider", code: "provider_temporary_provider" }, "paid_v3_diagnosis_provider_temporary_provider", "transient", true]
  ] as const)(
    "maps Paid V3 diagnosis failure %s to %s (%s)",
    (failure, jobCode, classification, hasRetry) => {
      const normalized = normalizeJobError(
        createPaidV3DiagnosisIncompleteError("question-1", {
          providerAttempts: 1,
          failure: { ...failure, parserPath: null }
        }),
        { ...context, phase: "grounded_answer_synthesis" }
      );
      expect(normalized).toMatchObject({
        classification,
        code: jobCode,
        type: "PaidV3DiagnosisIncompleteError"
      });
      expect(normalized.code).not.toBe("unexpected_internal_error");
      if (hasRetry) expect(normalized.retryableAt).toBeInstanceOf(Date);
      else expect(normalized.retryableAt).toBeNull();
    }
  );

  it("escalates a recurrent transient fingerprint to permanent without consuming further attempts", () => {
    const first = normalizeJobError(new Error("socket hangup"), context, new Date("2030-01-01T00:00:00Z"));
    expect(first).toMatchObject({ classification: "transient", code: "unexpected_internal_error" });
    expect(first.retryableAt).toBeInstanceOf(Date);

    const second = normalizeJobError(new Error("socket hangup"), context, new Date("2030-01-01T00:05:00Z"));
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.classification).toBe("transient");

    const escalated = escalateFingerprintRecurrence(second);
    expect(escalated).toMatchObject({
      classification: "permanent",
      code: "unexpected_internal_error",
      fingerprint: first.fingerprint,
      retryableAt: null
    });
  });

  it("leaves non-transient classifications untouched by fingerprint escalation", () => {
    const permanent = normalizeJobError(
      new ModelTokenBudgetError({
        accepted: false,
        code: "context_window_exceeded",
        estimatedTotalTokens: 20_000,
        limitTokens: 8_000
      }),
      context
    );
    expect(permanent.classification).toBe("permanent");
    expect(escalateFingerprintRecurrence(permanent)).toBe(permanent);
  });

  it("classifies forensic query-variant and snapshot-binding coverage errors as permanent on first hit", () => {
    const coverage = normalizeJobError(
      new PublicSourceQueryVariantCoverageError(),
      { ...context, phase: "source_retrieval" },
      new Date("2030-01-01T00:00:00Z")
    );
    expect(coverage).toMatchObject({
      classification: "permanent",
      code: "public_source_query_variant_coverage",
      type: "PublicSourceQueryVariantCoverageError",
      retryableAt: null
    });
    expect(coverage.code).not.toBe("unexpected_internal_error");

    const binding = normalizeJobError(
      new PublicSourceSnapshotQueryBindingError(),
      { ...context, phase: "source_retrieval" }
    );
    expect(binding).toMatchObject({
      classification: "permanent",
      code: "public_source_snapshot_query_binding",
      retryableAt: null
    });
  });

  it("maps diagnosis provider transport to a transient diagnosis_* job code", () => {
    const normalized = normalizeJobError(
      new ReportV4DiagnosisProviderError("transport", "temporary diagnosis transport failure"),
      { ...context, phase: "grounded_answer_synthesis" },
      new Date("2030-01-01T00:00:00Z")
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "diagnosis_transport",
      type: "ReportV4DiagnosisProviderError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(normalized.code).not.toBe("unexpected_internal_error");
  });

  it("maps question provider authentication to operator-repairable question_* job code", () => {
    const normalized = normalizeJobError(
      new ReportV4QuestionProviderError("authentication", "question provider auth failed"),
      { ...context, phase: "grounded_answer_synthesis" }
    );
    expect(normalized).toMatchObject({
      classification: "operator_repairable",
      code: "question_authentication",
      type: "ReportV4QuestionProviderError",
      retryableAt: null
    });
  });

  it.each([
    ["authentication", "generative_search_authentication", "operator_repairable", false],
    ["unavailable", "generative_search_unavailable", "transient", true],
    ["malformed", "generative_search_malformed", "transient", true],
    ["aborted", "generative_search_aborted", "transient", true]
  ] as const)(
    "maps MiMoGenerativeSearchAnswerError %s to %s (%s)",
    (errorClass, jobCode, classification, hasRetry) => {
      const normalized = normalizeJobError(
        new MiMoGenerativeSearchAnswerError(errorClass, `safe ${errorClass}`),
        { ...context, phase: "grounded_answer_synthesis" }
      );
      expect(normalized).toMatchObject({
        classification,
        code: jobCode,
        type: "MiMoGenerativeSearchAnswerError"
      });
      expect(normalized.code).not.toBe("unexpected_internal_error");
      if (hasRetry) expect(normalized.retryableAt).toBeInstanceOf(Date);
      else expect(normalized.retryableAt).toBeNull();
    }
  );

  it("maps structured MiMo invalid response to a transient typed job code", () => {
    const normalized = normalizeJobError(
      new ReportV4MimoProviderError(MIMO_INVALID_RESPONSE_CODE, "The MiMo provider response is missing choices."),
      { ...context, phase: "grounded_answer_synthesis" },
      new Date("2030-01-01T00:00:00Z")
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: MIMO_INVALID_RESPONSE_JOB_CODE,
      type: "ReportV4MimoProviderError",
      message: "The MiMo provider response is missing choices."
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
    expect(normalized.code).not.toBe("unexpected_internal_error");
  });

  it("maps report_global_v1 evidence missing to a permanent typed job code", () => {
    const normalized = normalizeJobError(
      new ReportSemanticReviewEvidenceMissingError({
        fieldPath: "$reviewOutput.fields[0]",
        manifestKind: "field"
      }),
      { ...context, phase: "grounded_answer_synthesis" }
    );
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE,
      type: "ReportSemanticReviewEvidenceMissingError",
      retryableAt: null
    });
    expect(normalized.message).toContain("$reviewOutput.fields[0]");
    expect(normalized.code).not.toBe("unexpected_internal_error");
  });

  it.each([
    ["transport", "mimo_transport", "transient", true],
    ["rate_limited", "mimo_rate_limited", "transient", true],
    ["temporary_provider", "mimo_temporary_provider", "transient", true],
    [MIMO_INVALID_RESPONSE_CODE, MIMO_INVALID_RESPONSE_JOB_CODE, "transient", true],
    [MIMO_TIMEOUT_CODE, "mimo_timeout", "transient", true],
    ["authentication", "mimo_authentication", "operator_repairable", false],
    ["configuration", "mimo_configuration", "operator_repairable", false],
    ["safety", "mimo_safety", "permanent", false],
    [MIMO_OUTPUT_TRUNCATED_CODE, "mimo_output_truncated", "transient", true],
    [MIMO_CONTENT_FILTERED_CODE, "mimo_content_filtered", "permanent", false]
  ] as const)(
    "maps MiMo provider code %s to job %s (%s)",
    (providerCode, jobCode, classification, hasRetry) => {
      const normalized = normalizeJobError(
        new ReportV4MimoProviderError(providerCode, `safe ${providerCode}`),
        { ...context, phase: "grounded_answer_synthesis" }
      );
      expect(normalized).toMatchObject({ classification, code: jobCode, type: "ReportV4MimoProviderError" });
      expect(normalized.code).not.toBe("unexpected_internal_error");
      if (hasRetry) expect(normalized.retryableAt).toBeInstanceOf(Date);
      else expect(normalized.retryableAt).toBeNull();
    }
  );

  it("maps model token budget rejection to a permanent typed job code", () => {
    const normalized = normalizeJobError(
      new ModelTokenBudgetError({
        accepted: false,
        code: "context_window_exceeded",
        estimatedTotalTokens: 20_000,
        limitTokens: 8_000
      }),
      context
    );
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "model_token_budget_rejected",
      type: "ModelTokenBudgetError",
      retryableAt: null
    });
  });

  it("maps deep provider discovery pipeline identity mismatch to permanent (progress-96 lane)", () => {
    const normalized = normalizeJobError(
      new ProviderDiscoveryResumeIdentityMismatchError("Provider claim set changed during resume."),
      { ...context, phase: "provider_claim_extraction" }
    );
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "provider_discovery_resume_identity_mismatch",
      type: "ProviderDiscoveryResumeIdentityMismatchError",
      retryableAt: null
    });
    expect(normalized.code).not.toBe("unexpected_internal_error");
  });

  it("maps provider discovery deadline exceeded to transient", () => {
    const normalized = normalizeJobError(
      new ProviderDiscoveryDeadlineExceededError("Provider discovery hard deadline was reached."),
      { ...context, phase: "provider_claim_extraction" },
      new Date("2030-01-01T00:00:00Z")
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "provider_discovery_deadline_exceeded",
      type: "ProviderDiscoveryDeadlineExceededError"
    });
    expect(normalized.retryableAt).toBeInstanceOf(Date);
  });

  it("maps provider discovery pipeline contract failure to permanent", () => {
    const normalized = normalizeJobError(
      new ProviderDiscoveryPipelineContractError("Provider discovery stage is invalid."),
      { ...context, phase: "provider_passage_selection" }
    );
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "provider_discovery_pipeline_contract",
      type: "ProviderDiscoveryPipelineContractError",
      retryableAt: null
    });
  });

  it("maps public-source forensics resume identity mismatch to permanent with a diagnosable message", () => {
    const normalized = normalizeJobError(
      new PublicSourceResumeIdentityMismatchError(),
      { ...context, phase: "source_retrieval" }
    );
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "public_source_resume_identity_mismatch",
      type: "PublicSourceResumeIdentityMismatchError",
      retryableAt: null
    });
    expect(normalized.message).toBe("Public-source forensics resume identity does not match the persisted checkpoint.");
  });

  it("maps a duck-typed public-source resume identity mismatch rethrow to permanent", () => {
    const rethrown = new Error("");
    rethrown.name = "PublicSourceResumeIdentityMismatchError";
    const normalized = normalizeJobError(rethrown, { ...context, phase: "source_retrieval" });
    expect(normalized).toMatchObject({
      classification: "permanent",
      code: "public_source_resume_identity_mismatch",
      retryableAt: null
    });
    expect(normalized.message).toBe("Public-source forensics resume identity does not match the persisted checkpoint.");
  });

  it.each([
    [401, "provider_claim_extraction_authentication", "operator_repairable", false],
    [429, "provider_claim_extraction_rate_limited", "transient", true],
    [503, "provider_claim_extraction_temporary", "transient", true],
    [undefined, "provider_claim_extraction_timeout", "transient", true]
  ] as const)(
    "maps AiClientError at provider_claim_extraction (progress 96) status %s to %s",
    (status, jobCode, classification, hasRetry) => {
      const message = status == null
        ? "AI request was aborted or timed out."
        : `AI request failed with HTTP ${status}.`;
      const normalized = normalizeJobError(
        new AiClientError(message, status == null ? {} : { status }),
        { ...context, phase: "provider_claim_extraction" }
      );
      expect(normalized).toMatchObject({
        classification,
        code: jobCode,
        type: "AiClientError"
      });
      expect(normalized.code).not.toBe("unexpected_internal_error");
      if (hasRetry) expect(normalized.retryableAt).toBeInstanceOf(Date);
      else expect(normalized.retryableAt).toBeNull();
      expect(JSON.stringify(normalized)).not.toMatch(/sk-|api[_-]?key|response body/i);
    }
  );

  it("maps AiClientError outside claim extraction to ai_client_* codes", () => {
    const normalized = normalizeJobError(
      new AiClientError("The model returned invalid JSON."),
      { ...context, phase: "grounded_answer_synthesis" }
    );
    expect(normalized).toMatchObject({
      classification: "transient",
      code: "ai_client_invalid_response",
      type: "AiClientError"
    });
  });
});
