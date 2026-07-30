import { describe, expect, it } from "vitest";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  ReportSemanticReviewEvidenceMissingError,
  SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE,
  SEMANTIC_REVIEW_EVIDENCE_MISSING_REASON,
  SEMANTIC_REVIEW_LOCAL_EVIDENCE_MISSING_REASON,
  applyReportSemanticReview,
  assembleFreeV4BatchedSemanticReviewRaw,
  buildFreeV4ReportSemanticReviewSystemPrompt,
  buildFreeV4SemanticReviewBatchSystemPrompt,
  buildPaidV3ReportSemanticReviewSystemPrompt,
  buildReportSemanticReviewSystemPrompt,
  createReportSemanticReviewInput,
  hashReportSemanticReviewValue,
  listFreeV4SemanticReviewBatches,
  parseReportSemanticReviewInput,
  parseReportSemanticReviewOutput,
  reportSemanticTextHash,
  verifyReportSemanticReviewReceipt,
  deriveFreeObservationMetrics,
  type FreeV4SemanticReviewBatchId,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewInputCore
} from "./report-semantic-review";
import { runOfflineReportSemanticReviewBatched } from "./report-semantic-review-provider-adapter";

describe("Free V4 batched semantic review", () => {
  it("lists structural batches and assembles a full valid review without estimation", async () => {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const input = createReportSemanticReviewInput(core);
    const batches = listFreeV4SemanticReviewBatches(input);
    expect(batches.length).toBeGreaterThanOrEqual(2);
    expect(batches).toContain("B_fields_readonly");
    expect(batches).toContain("B_fields_mutable");

    const full = validReview(input) as {
      fields: Array<{ path: string } & Record<string, unknown>>;
      annotations: {
        observationResults: unknown[];
        answers: unknown[];
        evidenceUse: unknown[];
      };
      overallDecision: string;
    };
    const payloads: Partial<Record<FreeV4SemanticReviewBatchId, unknown>> = {
      B_fields_readonly: {
        fields: full.fields.filter((field) =>
          input.fields.find((m) => m.path === field.path)?.mutability === "read_only"
        )
      },
      B_fields_mutable: {
        fields: full.fields.filter((field) =>
          input.fields.find((m) => m.path === field.path)?.mutability === "mutable"
        )
      },
      B_obs: { observationResults: full.annotations.observationResults },
      B_answers: { answers: full.annotations.answers },
      B_evidence_use: { evidenceUse: full.annotations.evidenceUse }
    };
    const assembled = assembleFreeV4BatchedSemanticReviewRaw(input, payloads);
    const parsed = parseReportSemanticReviewOutput(assembled, input);
    expect(parsed.fields).toHaveLength(input.fields.length);
    expect(parsed.questionDistinctness.decision).toBe("distinct");
    expect(parsed.overallDecision).toBe(full.overallDecision);

    let invokes = 0;
    const offline = await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => {
      invokes += 1;
      expect(buildFreeV4SemanticReviewBatchSystemPrompt(input, batchId)).toContain("BATCH MODE");
      return payloads[batchId]!;
    });
    expect(invokes).toBe(batches.length);
    expect(offline.batchIds).toEqual(batches);
    expect(offline.review.fields).toHaveLength(input.fields.length);
  });

  it("fills a field path missing from batches with a synthesized pass entry", () => {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const input = createReportSemanticReviewInput(core);
    const full = validReview(input) as {
      fields: Array<{ path: string } & Record<string, unknown>>;
      annotations: {
        observationResults: unknown[];
        answers: unknown[];
        evidenceUse: unknown[];
      };
    };
    const assembled = assembleFreeV4BatchedSemanticReviewRaw(input, {
      B_fields_readonly: { fields: [] },
      B_fields_mutable: { fields: full.fields.filter((field) =>
        input.fields.find((m) => m.path === field.path)?.mutability === "mutable"
      ) },
      B_obs: { observationResults: full.annotations.observationResults },
      B_answers: { answers: full.annotations.answers },
      B_evidence_use: { evidenceUse: full.annotations.evidenceUse }
    });
    const parsed = parseReportSemanticReviewOutput(assembled, input);
    expect(parsed.fields).toHaveLength(input.fields.length);
    const synthesized = parsed.fields.find(({ path }) => path === "questions[0].text");
    expect(synthesized).toMatchObject({
      decision: "pass",
      issueCodes: [],
      reason: "degraded: contract violation",
      evidenceIds: [],
      sourceIds: []
    });
  });

  it("ignores undeclared batch envelope keys such as inputHash and parses to the clean-envelope result (C3)", () => {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const input = createReportSemanticReviewInput(core);
    const full = validReview(input) as {
      fields: Array<{ path: string } & Record<string, unknown>>;
      annotations: { observationResults: unknown[]; answers: unknown[]; evidenceUse: unknown[] };
    };
    const clean: Record<FreeV4SemanticReviewBatchId, unknown> = {
      B_fields_readonly: {
        fields: full.fields.filter((field) => input.fields.find((m) => m.path === field.path)?.mutability === "read_only")
      },
      B_fields_mutable: {
        fields: full.fields.filter((field) => input.fields.find((m) => m.path === field.path)?.mutability === "mutable")
      },
      B_obs: { observationResults: full.annotations.observationResults },
      B_answers: { answers: full.annotations.answers },
      B_evidence_use: { evidenceUse: full.annotations.evidenceUse }
    };
    // The real run-3 envelope carried an undeclared inputHash key on $B_obs.
    const withExtra = Object.fromEntries(Object.entries(clean).map(([batchId, envelope]) => [
      batchId,
      { ...(envelope as Record<string, unknown>), inputHash: input.inputHash }
    ]));
    const expected = parseReportSemanticReviewOutput(assembleFreeV4BatchedSemanticReviewRaw(input, clean), input);
    const actual = parseReportSemanticReviewOutput(assembleFreeV4BatchedSemanticReviewRaw(input, withExtra), input);
    expect(actual).toEqual(expected);
    expect(actual.fields).toHaveLength(input.fields.length);
  });
});

describe("Free V4 semantic review graceful degradation", () => {
  it("degrades a field with missing local references to a synthesized pass and applies the original prose", () => {
    const input = freeInput();
    const review = validReview(input);
    reviewFields(review)[1]!.evidenceIds = [];
    reviewFields(review)[1]!.sourceIds = [];

    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.fields[1]).toMatchObject({
      path: input.fields[1]!.path,
      originalTextHash: input.fields[1]!.originalTextHash,
      decision: "pass",
      issueCodes: [],
      reason: "degraded: contract violation",
      evidenceIds: ["evidence-q1"],
      sourceIds: ["source-q1"]
    });
    expect(parsed.overallDecision).toBe("pass");
    const applied = applyReportSemanticReview(input, parsed);
    expect(applied.fields[1]!.appliedText).toBe(input.fields[1]!.originalText);
    expect(applied.receipt.decision).toBe("pass");
    expect(verifyReportSemanticReviewReceipt(applied.receipt, input, parsed, applied.fields)).toEqual(applied.receipt);
  });

  it("ignores out-of-allowlist model references and code-mounts ownership-compatible refs", () => {
    const input = freeInput();
    const subsetViolation = validReview(input);
    reviewFields(subsetViolation)[1]!.evidenceIds = ["mimo-annotation-999"];
    const degraded = parseReportSemanticReviewOutput(subsetViolation, input);
    expect(degraded.fields[1]).toMatchObject({
      decision: "pass",
      reason: "degraded: contract violation",
      evidenceIds: ["evidence-q1"],
      sourceIds: ["source-q1"]
    });

    const kept = validReview(input);
    reviewFields(kept)[1]!.evidenceIds = ["evidence-q1"];
    reviewFields(kept)[1]!.sourceIds = [];
    const parsedKept = parseReportSemanticReviewOutput(kept, input);
    expect(parsedKept.fields[1]!.reason).not.toBe("degraded: contract violation");
    expect(parsedKept.fields[1]!.evidenceIds).toEqual(["evidence-q1"]);
    expect(parsedKept.fields[1]!.sourceIds).toEqual(["source-q1"]);
  });

  it("degrades blank and byte-identical correctedText to the original prose", () => {
    const input = freeInput();
    const blank = validReview(input);
    Object.assign(reviewFields(blank)[1]!, {
      decision: "corrected",
      correctedText: "   ",
      issueCodes: ["language_quality"]
    });
    const degradedBlank = parseReportSemanticReviewOutput(blank, input);
    expect(degradedBlank.fields[1]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(degradedBlank.fields[1]!.correctedText).toBeUndefined();
    expect(degradedBlank.overallDecision).toBe("pass");

    const identical = validReview(input);
    Object.assign(reviewFields(identical)[1]!, {
      decision: "corrected",
      correctedText: input.fields[1]!.originalText,
      issueCodes: ["language_quality"]
    });
    const degradedIdentical = parseReportSemanticReviewOutput(identical, input);
    expect(degradedIdentical.fields[1]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    const applied = applyReportSemanticReview(input, degradedIdentical);
    expect(applied.fields[1]!.appliedText).toBe(input.fields[1]!.originalText);
  });

  it("degrades a model self-reported blocked field and recomputes overallDecision", () => {
    const input = freeInput();
    const review = validReview(input);
    Object.assign(reviewFields(review)[0]!, {
      decision: "blocked",
      issueCodes: ["unsupported_causal_claim"],
      reason: "The claim is not supported by the bound evidence."
    });
    review.overallDecision = "blocked";

    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.fields[0]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(parsed.overallDecision).toBe("pass");
    const applied = applyReportSemanticReview(input, parsed);
    expect(applied.receipt.decision).toBe("pass");
    expect(applied.fields[0]!.appliedText).toBe(input.fields[0]!.originalText);
  });

  it("fills missing batch fields and keeps the first duplicate path during assembly", () => {
    const input = freeInput();
    const full = validReview(input) as {
      fields: Array<{ path: string } & Record<string, unknown>>;
      annotations: { observationResults: unknown[]; answers: unknown[]; evidenceUse: unknown[] };
    };
    const mutableRows = full.fields.filter((field) =>
      input.fields.find((m) => m.path === field.path)?.mutability === "mutable"
    );
    const duplicated = [structuredClone(mutableRows[0]!), ...mutableRows];
    duplicated[0]!.reason = "first duplicate wins";
    const assembled = assembleFreeV4BatchedSemanticReviewRaw(input, {
      B_fields_readonly: { fields: [] },
      B_fields_mutable: { fields: duplicated },
      B_obs: { observationResults: full.annotations.observationResults },
      B_answers: { answers: full.annotations.answers },
      B_evidence_use: { evidenceUse: full.annotations.evidenceUse }
    });
    const parsed = parseReportSemanticReviewOutput(assembled, input);
    expect(parsed.fields).toHaveLength(input.fields.length);
    expect(parsed.fields.find(({ path }) => path === "questions[0].text"))
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(parsed.fields[0]!.reason).toBe("first duplicate wins");
  });

  it("sanitizes malformed annotation rows and filters out-of-catalog references", () => {
    const input = freeInput();
    const review = validReview(input);
    const annotations = review.annotations as {
      observationResults: unknown[];
      answers: Array<Record<string, unknown>>;
      evidenceUse: unknown[];
    };
    annotations.observationResults = ["broken"];
    annotations.answers[0]!.evidenceIds = ["mimo-annotation-999"];
    annotations.answers[0]!.questionId = "echoed-wrong-question";
    annotations.evidenceUse = [{ nonsense: true }];

    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.annotations.observationResults[0]).toMatchObject({
      observationId: input.observationResults[0]!.observationId,
      resultId: input.observationResults[0]!.resultId,
      targetPresence: "ambiguous",
      competitorPresence: "ambiguous",
      reason: "degraded: contract violation"
    });
    expect(parsed.annotations.answers[0]).toMatchObject({
      questionId: "question-1",
      relevance: "responsive",
      evidenceIds: [],
      sourceIds: ["source-q1"]
    });
    expect(parsed.annotations.evidenceUse).toHaveLength(input.fields.length);
    expect(parsed.annotations.evidenceUse[0]).toMatchObject({
      path: input.fields[0]!.path,
      evidenceIds: [],
      sourceIds: ["source-global"],
      reason: "degraded: contract violation"
    });
    expect(parsed.annotations.evidenceUse.slice(1).every((row) => row.reason === "degraded: contract violation")).toBe(true);
  });

  it("keeps a fully valid Free review unchanged, including corrections", () => {
    const input = freeInput();
    const review = validReview(input);
    Object.assign(reviewFields(review)[1]!, {
      decision: "corrected",
      correctedText: "顺心捷达提供覆盖全国的FBA头程服务。",
      issueCodes: ["answer_not_direct"],
      reason: "The draft needed a direct answer."
    });
    review.overallDecision = "blocked";

    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.fields[1]).toMatchObject({
      decision: "corrected",
      correctedText: "顺心捷达提供覆盖全国的FBA头程服务。",
      issueCodes: ["answer_not_direct"],
      evidenceIds: ["evidence-q1"],
      sourceIds: ["source-q1"]
    });
    expect(parsed.overallDecision).toBe("corrected");
    const applied = applyReportSemanticReview(input, parsed);
    expect(applied.fields[1]!.appliedText).toBe("顺心捷达提供覆盖全国的FBA头程服务。");
    expect(verifyReportSemanticReviewReceipt(applied.receipt, input, parsed, applied.fields)).toEqual(applied.receipt);
  });

  it("keeps the Paid report_global_v1 path fail-closed for the same violation classes", () => {
    const input = globalInput();
    const missingRefs = globalReview(input);
    reviewFields(missingRefs)[0]!.evidenceIds = [];
    expect(() => parseReportSemanticReviewOutput(missingRefs, input)).toThrow(ReportSemanticReviewEvidenceMissingError);

    const subsetViolation = globalReview(input);
    reviewFields(subsetViolation)[0]!.evidenceIds = ["mimo-annotation-999"];
    expect(() => parseReportSemanticReviewOutput(subsetViolation, input)).toThrow(/unknown|disallowed/u);

    const missingFields = globalReview(input);
    reviewFields(missingFields).pop();
    expect(() => parseReportSemanticReviewOutput(missingFields, input)).toThrow(/cover/u);

    const wrongOverall = globalReview(input);
    wrongOverall.overallDecision = "corrected";
    expect(() => parseReportSemanticReviewOutput(wrongOverall, input)).toThrow(/must equal pass/u);
  });
});

describe("ReportSemanticReview input authority", () => {
  it("builds a version-locked complete JSON review instruction for real providers", () => {
    const prompt = buildReportSemanticReviewSystemPrompt();
    expect(prompt).toContain(REPORT_SEMANTIC_REVIEW_CONTRACT);
    expect(prompt).toContain("version, inputHash, providerId, modelId, fields, questionDistinctness, annotations, overallDecision");
    expect(prompt).toMatch(/input order/iu);
    expect(prompt).toMatch(/pass, corrected, or blocked/iu);
    expect(prompt).toMatch(/correctedText.*natural customer prose in input\.locale/isu);
    expect(prompt).toMatch(/brand names.*professional terms.*another language/isu);
    expect(prompt).toMatch(/at least one reference across evidenceIds and sourceIds/iu);
    expect(prompt).toMatch(/targetPresence.*targetFirstSentence.*targetRoles.*competitorEntityIds/isu);
    expect(prompt).toMatch(/overallDecision exactly/iu);
    expect(prompt).toMatch(/no Markdown/iu);
  });
  it("makes Paid source-selection identities and evidence binding explicit to the reviewer", () => {
    const prompt = buildPaidV3ReportSemanticReviewSystemPrompt();
    expect(prompt).toMatch(/annotationId, itemId, kind, questionId, sourceId, profileId, actionId/iu);
    expect(prompt).toMatch(/stable catalog identity.*target-state gap.*factor.*action/isu);
    expect(prompt).toMatch(/Use only exact catalog evidence IDs/iu);
    expect(prompt).toMatch(/never derive.*regexes.*keywords/isu);
  });
  it("builds a Free V4 request blueprint with exact field-local evidence boundaries", () => {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const input = createReportSemanticReviewInput(core);
    const prompt = buildFreeV4ReportSemanticReviewSystemPrompt(input);

    expect(prompt).toContain("Free V4 request blueprint");
    expect(prompt).toContain('"index":0');
    expect(prompt).toContain(`"path":"${input.fields[0]!.path}"`);
    expect(prompt).toContain(`"originalTextHash":"${input.fields[0]!.originalTextHash}"`);
    expect(prompt).toContain(`"allowedEvidenceIds":["${input.fields[1]!.allowedEvidenceIds[0]}"]`);
    expect(prompt).toContain("Global catalogs establish known IDs only; they do not widen a field allowlist.");
    expect(prompt).toContain("correctedText byte-for-byte different");
    expect(prompt).toContain("Blueprint-only index is an ordering aid; omit index from every output field object.");
    expect(prompt).toContain("path, originalTextHash, decision, optional correctedText, issueCodes, reason, evidenceIds, sourceIds, retainedOriginalTerms");
    expect(prompt).not.toContain("rejectedEvidence");
    expect(prompt).toContain("complete JSON skeleton and checklist");
  });
  it("creates a canonical input hash independent of object key insertion order", () => {
    const input = createReportSemanticReviewInput(inputCore());
    expect(input.version).toBe(REPORT_SEMANTIC_REVIEW_CONTRACT);
    expect(input.questions).toHaveLength(3);
    expect(input.inputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(parseReportSemanticReviewInput(input)).toEqual(input);
    expect(hashReportSemanticReviewValue({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(hashReportSemanticReviewValue({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it("accepts unseen mixed-language brands and industry terms without interpreting them", () => {
    const core = inputCore();
    core.target.aliases = ["Shun Express顺心捷达", "Shopee虾皮", "FBA头程"];
    core.fields[0]!.originalText = "Shun Express顺心捷达提供FBA头程与Shopee虾皮店配。";
    core.fields[0]!.originalTextHash = reportSemanticTextHash(core.fields[0]!.originalText);

    const input = createReportSemanticReviewInput(core);
    const review = validReview(input);
    reviewFields(review)[0]!.retainedOriginalTerms = [
      { term: "Shun Express顺心捷达", reason: "The evidence identifies this as the customer brand." },
      { term: "FBA头程", reason: "The evidence uses this industry term as written." },
      { term: "Shopee虾皮", reason: "The source uses the mixed-language product name." }
    ];

    expect(parseReportSemanticReviewOutput(review, input).fields[0]?.retainedOriginalTerms)
      .toHaveLength(3);
  });

  it.each([
    ["question text", (core: MutableInputCore) => { core.questions[0]!.originalText = "changed"; }],
    ["source text", (core: MutableInputCore) => { core.sources[0]!.originalText = "changed"; }],
    ["evidence text", (core: MutableInputCore) => { core.evidence[0]!.originalText = "changed"; }],
    ["field text", (core: MutableInputCore) => { core.fields[0]!.originalText = "changed"; }]
  ])("rejects a stale %s hash", (_name, mutate) => {
    const core = inputCore();
    mutate(core);
    expect(() => createReportSemanticReviewInput(core)).toThrow(/Hash|hash/u);
  });

  it("rejects unsafe URLs, unknown keys, duplicate IDs, and non-canonical input hashes", () => {
    const unsafe = inputCore();
    unsafe.target.targetUrl = "https://user:secret@example.com/";
    expect(() => createReportSemanticReviewInput(unsafe)).toThrow(/credential-free/u);

    const duplicate = inputCore();
    duplicate.questions[1]!.questionId = duplicate.questions[0]!.questionId;
    expect(() => createReportSemanticReviewInput(duplicate)).toThrow(/unique/u);

    const unknown = { ...createReportSemanticReviewInput(inputCore()), extra: true };
    expect(() => parseReportSemanticReviewInput(unknown)).toThrow(/unknown key/u);

    const stale = { ...createReportSemanticReviewInput(inputCore()), locale: "en" };
    expect(() => parseReportSemanticReviewInput(stale)).toThrow(/canonical review input/u);
  });

  it("rejects unknown and cross-question ownership in source, evidence, and field bindings", () => {
    const unknownSource = inputCore();
    unknownSource.evidence[0]!.sourceId = "missing-source";
    expect(() => createReportSemanticReviewInput(unknownSource)).toThrow(/unknown source/u);

    const crossOwnedEvidence = inputCore();
    crossOwnedEvidence.fields[1]!.questionId = "question-2";
    expect(() => createReportSemanticReviewInput(crossOwnedEvidence)).toThrow(/another question/u);

    const crossOwnedSource = inputCore();
    crossOwnedSource.evidence[0]!.questionId = "question-2";
    expect(() => createReportSemanticReviewInput(crossOwnedSource)).toThrow(/different question owners/u);
  });

  it("rejects non-JSON canonical values", () => {
    expect(() => hashReportSemanticReviewValue({ value: Number.NaN })).toThrow(/non-finite/u);
    expect(() => hashReportSemanticReviewValue({ value: undefined })).toThrow(/undefined/u);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => hashReportSemanticReviewValue(cyclic)).toThrow(/cycles/u);
  });
});

describe("ReportSemanticReview model output", () => {
  it("uses eligible report-global references across fields while legacy degrades field-local violations", () => {
    const global = globalInput();
    const review = globalReview(global);
    expect(parseReportSemanticReviewOutput(review, global).fields[0]!.evidenceIds).toEqual(["evidence-q1"]);

    const legacyCore = inputCore();
    const legacy = createReportSemanticReviewInput(legacyCore);
    const crossField = validReview(legacy);
    reviewFields(crossField)[0]!.evidenceIds = ["evidence-q1"];
    const degraded = parseReportSemanticReviewOutput(crossField, legacy);
    expect(degraded.fields[0]).toMatchObject({
      decision: "pass",
      reason: "degraded: contract violation",
      evidenceIds: [],
      sourceIds: ["source-global"]
    });
  });

  it("fails closed global accepted and rejected reference violations while preserving blocked safety", () => {
    for (const mutate of [
      (review: Record<string, unknown>) => { reviewFields(review)[0]!.evidenceIds = ["unknown"]; },
      (review: Record<string, unknown>) => { reviewFields(review)[0]!.evidenceIds = ["ineligible"]; },
      (review: Record<string, unknown>) => { reviewFields(review)[0]!.evidenceIds = ["missing-eligibility"]; },
      (review: Record<string, unknown>) => { reviewFields(review)[0]!.rejectedEvidence = [{ evidenceId: "evidence-q1", reason: "not used" }, { evidenceId: "evidence-q1", reason: "duplicate" }]; },
      (review: Record<string, unknown>) => { reviewFields(review)[0]!.rejectedEvidence = [{ evidenceId: "evidence-q1", reason: "overlap" }]; }
    ]) {
      const input = globalInput();
      const review = globalReview(input);
      mutate(review);
      expect(() => parseReportSemanticReviewOutput(review, input)).toThrow(/unknown|eligib|duplicate|overlap/u);
    }
    const input = globalInput();
    const parsed = parseReportSemanticReviewOutput(globalReview(input), input);
    expect(parsed.fields[0]!.rejectedEvidence).toEqual([{ evidenceId: "global-extra", reason: "Not needed for this conclusion." }]);
    for (const key of ["rejectedEvidence", "rejectedSources"] as const) {
      const missing = globalReview(input);
      delete reviewFields(missing)[0]![key];
      expect(() => parseReportSemanticReviewOutput(missing, input)).toThrow(/must include rejectedEvidence and rejectedSources/u);
    }

    const zero = globalReview(input);
    reviewFields(zero)[0]!.evidenceIds = [];
    expect(() => parseReportSemanticReviewOutput(zero, input)).toThrow(ReportSemanticReviewEvidenceMissingError);
    try {
      parseReportSemanticReviewOutput(zero, input);
    } catch (error) {
      expect(error).toMatchObject({
        name: "ReportSemanticReviewEvidenceMissingError",
        code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE,
        reason: SEMANTIC_REVIEW_EVIDENCE_MISSING_REASON,
        fieldPath: "$reviewOutput.fields[0]",
        manifestKind: "field",
        message: expect.stringMatching(/requires accepted evidence or source/u)
      });
    }

    const missingAnswer = globalReview(input);
    (missingAnswer.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.evidenceIds = [];
    (missingAnswer.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.sourceIds = [];
    expect(() => parseReportSemanticReviewOutput(missingAnswer, input)).toThrow(ReportSemanticReviewEvidenceMissingError);
    try {
      parseReportSemanticReviewOutput(missingAnswer, input);
    } catch (error) {
      expect(error).toMatchObject({
        code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE,
        reason: SEMANTIC_REVIEW_EVIDENCE_MISSING_REASON,
        fieldPath: "$reviewOutput.annotations.answers[0]",
        manifestKind: "answer_annotation"
      });
    }

    const missingUse = globalReview(input);
    (missingUse.annotations as { evidenceUse: Array<Record<string, unknown>> }).evidenceUse[0]!.evidenceIds = [];
    (missingUse.annotations as { evidenceUse: Array<Record<string, unknown>> }).evidenceUse[0]!.sourceIds = [];
    expect(() => parseReportSemanticReviewOutput(missingUse, input)).toThrow(ReportSemanticReviewEvidenceMissingError);
    try {
      parseReportSemanticReviewOutput(missingUse, input);
    } catch (error) {
      expect(error).toMatchObject({
        code: SEMANTIC_REVIEW_EVIDENCE_MISSING_CODE,
        reason: SEMANTIC_REVIEW_EVIDENCE_MISSING_REASON,
        fieldPath: "$reviewOutput.annotations.evidenceUse[0]",
        manifestKind: "evidence_use_annotation"
      });
    }

    reviewFields(zero)[0]!.decision = "blocked";
    reviewFields(zero)[0]!.issueCodes = ["unsupported"];
    zero.overallDecision = "blocked";
    expect(parseReportSemanticReviewOutput(zero, input).fields[0]!.decision).toBe("blocked");
  });

  it("degrades field-local allowlist violations without report_global_v1, and allows empty refs when allowlists are empty", () => {
    const freeCore = inputCore();
    freeCore.lifecycle = "free_v4";
    freeCore.fields = freeCore.fields.map((field, index) => index === 0
      ? { ...field, allowedEvidenceIds: [], allowedSourceIds: [] }
      : field);
    const noAllow = createReportSemanticReviewInput(freeCore);
    expect(noAllow.evidencePolicy).toBeUndefined();
    const noAllowReview = validReview(noAllow);
    reviewFields(noAllowReview)[0]!.evidenceIds = [];
    reviewFields(noAllowReview)[0]!.sourceIds = [];
    expect(parseReportSemanticReviewOutput(noAllowReview, noAllow).fields[0]!.evidenceIds).toEqual([]);

    const withAllowCore = inputCore();
    withAllowCore.lifecycle = "free_v4";
    const withAllow = createReportSemanticReviewInput(withAllowCore);
    expect(withAllow.fields[0]!.allowedSourceIds.length + withAllow.fields[0]!.allowedEvidenceIds.length).toBeGreaterThan(0);
    const missingLocal = validReview(withAllow);
    reviewFields(missingLocal)[0]!.evidenceIds = [];
    reviewFields(missingLocal)[0]!.sourceIds = [];
    const degraded = parseReportSemanticReviewOutput(missingLocal, withAllow);
    expect(degraded.fields[0]).toMatchObject({
      decision: "pass",
      issueCodes: [],
      reason: "degraded: contract violation",
      evidenceIds: [],
      sourceIds: ["source-global"]
    });

    reviewFields(missingLocal)[0]!.decision = "blocked";
    reviewFields(missingLocal)[0]!.issueCodes = ["unsupported"];
    missingLocal.overallDecision = "blocked";
    const degradedBlocked = parseReportSemanticReviewOutput(missingLocal, withAllow);
    expect(degradedBlocked.fields[0]!.decision).toBe("pass");
    expect(degradedBlocked.overallDecision).toBe("pass");
  });

  it("degrades rejected reference keys outside the legacy exact contract and documents global prompts", () => {
    const legacy = createReportSemanticReviewInput(inputCore());
    const legacyReview = validReview(legacy);
    reviewFields(legacyReview)[0]!.rejectedEvidence = [];
    expect(parseReportSemanticReviewOutput(legacyReview, legacy).fields[0])
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    const global = globalInput();
    const freeGlobal = buildFreeV4ReportSemanticReviewSystemPrompt(global);
    expect(freeGlobal).toMatch(/report_global_v1.*rejectedEvidence.*rejectedSources/isu);
    expect(freeGlobal).toContain("path, originalTextHash, decision, optional correctedText, issueCodes, reason, evidenceIds, sourceIds, rejectedEvidence, rejectedSources, retainedOriginalTerms");
    const paid = buildPaidV3ReportSemanticReviewSystemPrompt();
    expect(paid).toMatch(/report_global_v1.*rejectedEvidence.*rejectedSources/isu);
    expect(paid).not.toMatch(/field-local allowlist/iu);
  });

  it("degrades a blueprint-only index in a response field", () => {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const input = createReportSemanticReviewInput(core);
    const review = validReview(input);
    reviewFields(review)[0]!.index = 0;

    expect(parseReportSemanticReviewOutput(review, input).fields[0])
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
  });

  it("parses a complete pass review and derives its overall decision", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const parsed = parseReportSemanticReviewOutput(validReview(input), input);
    expect(parsed.overallDecision).toBe("pass");
    expect(parsed.fields.map(({ path }) => path)).toEqual(input.fields.map(({ path }) => path));
  });

  it("applies only mutable corrections and creates a verifiable receipt", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    const result = reviewFields(review)[1]!;
    result.decision = "corrected";
    result.correctedText = "该答案直接说明了服务范围，并保留证据中的FBA头程术语。";
    result.issueCodes = ["answer_not_direct"];
    result.reason = "The draft needed a direct answer.";
    result.retainedOriginalTerms = [{ term: "FBA头程", reason: "The bound evidence uses this service term." }];
    review.overallDecision = "corrected";

    const applied = applyReportSemanticReview(input, review);
    expect(applied.fields[1]).toMatchObject({
      path: "answerCards[0].answerText",
      appliedText: result.correctedText,
      decision: "corrected"
    });
    expect(applied.fields[0]?.appliedText).toBe(input.fields[0]?.originalText);
    expect(verifyReportSemanticReviewReceipt(applied.receipt, input, review, applied.fields)).toEqual(applied.receipt);
  });

  it("accepts a blocked Free report_global review as evidence but refuses to apply it", () => {
    const input = globalInput();
    expect(input.lifecycle).toBe("free_v4");
    const review = globalReview(input);
    const result = reviewFields(review)[0]!;
    result.decision = "blocked";
    result.issueCodes = ["unsupported_causal_claim"];
    result.reason = "The claim is not supported by the bound evidence.";
    review.overallDecision = "blocked";

    expect(parseReportSemanticReviewOutput(review, input).overallDecision).toBe("blocked");
    expect(() => applyReportSemanticReview(input, review)).toThrow(/blocked semantic review/u);
  });

  it("degrades a blocked Paid V3 review to original prose with explicit blocked decisions", () => {
    const input = paidGlobalInput();
    expect(input.lifecycle).toBe("paid_v3");
    const review = globalReview(input);
    const result = reviewFields(review)[0]!;
    const original = input.fields[0]!.originalText;
    result.decision = "blocked";
    delete (result as { correctedText?: string }).correctedText;
    result.issueCodes = ["unsupported_causal_claim"];
    result.reason = "The claim is not supported by the bound evidence.";
    review.overallDecision = "blocked";

    const applied = applyReportSemanticReview(input, review);
    expect(applied.receipt.decision).toBe("blocked");
    expect(applied.fields[0]).toMatchObject({
      path: input.fields[0]!.path,
      appliedText: original,
      decision: "blocked"
    });
    expect(verifyReportSemanticReviewReceipt(applied.receipt, input, review, applied.fields)).toEqual(applied.receipt);
  });

  it.each([
    ["missing", (fields: Array<Record<string, unknown>>) => { fields.pop(); }],
    ["extra", (fields: Array<Record<string, unknown>>) => { fields.push(structuredClone(fields[0]!)); }],
    ["reordered", (fields: Array<Record<string, unknown>>) => { fields.reverse(); }],
    ["duplicate", (fields: Array<Record<string, unknown>>) => { fields[1] = structuredClone(fields[0]!); }]
  ])("rejects %s field coverage under report_global_v1", (_name, mutate) => {
    const input = globalInput();
    const review = globalReview(input);
    mutate(reviewFields(review));
    expect(() => parseReportSemanticReviewOutput(review, input)).toThrow(/cover|path/u);
  });

  it.each([
    ["missing", (fields: Array<Record<string, unknown>>) => { fields.pop(); }],
    ["extra", (fields: Array<Record<string, unknown>>) => { fields.push(structuredClone(fields[0]!)); }],
    ["reordered", (fields: Array<Record<string, unknown>>) => { fields.reverse(); }],
    ["duplicate", (fields: Array<Record<string, unknown>>) => { fields[1] = structuredClone(fields[0]!); }]
  ])("aligns %s Free field coverage to the input manifest", (_name, mutate) => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    mutate(reviewFields(review));
    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.fields.map(({ path }) => path)).toEqual(input.fields.map(({ path }) => path));
  });

  it("rejects model identity and original-text hash tampering", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const model = validReview(input);
    model.modelId = "another-model";
    expect(() => parseReportSemanticReviewOutput(model, input)).toThrow(/modelId/u);

    const textHashInput = globalInput();
    const textHash = globalReview(textHashInput);
    reviewFields(textHash)[0]!.originalTextHash = "f".repeat(64);
    expect(() => parseReportSemanticReviewOutput(textHash, textHashInput)).toThrow(/originalTextHash/u);
  });

  it("degrades a correction to a read-only field or unchanged corrected text", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const immutable = validReview(input);
    const immutableField = reviewFields(immutable)[2]!;
    immutableField.decision = "corrected";
    immutableField.correctedText = "Different question";
    immutableField.issueCodes = ["question_rewrite"];
    immutable.overallDecision = "corrected";
    const degradedImmutable = parseReportSemanticReviewOutput(immutable, input);
    expect(degradedImmutable.fields[2]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(degradedImmutable.overallDecision).toBe("pass");

    const unchanged = validReview(input);
    const unchangedField = reviewFields(unchanged)[0]!;
    unchangedField.decision = "corrected";
    unchangedField.correctedText = input.fields[0]!.originalText;
    unchangedField.issueCodes = ["language"];
    unchanged.overallDecision = "corrected";
    const degradedUnchanged = parseReportSemanticReviewOutput(unchanged, input);
    expect(degradedUnchanged.fields[0]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(applyReportSemanticReview(input, degradedUnchanged).fields[0]!.appliedText)
      .toBe(input.fields[0]!.originalText);
  });

  it("sanitizes disallowed/empty field references and duplicate retained terms while exact answer IDs pass", () => {
    const input = createReportSemanticReviewInput(inputCore()); expect(parseReportSemanticReviewOutput(validReview(input), input).fields[1]!.evidenceIds).toEqual(["evidence-q1"]);
    const refs = validReview(input);
    reviewFields(refs)[0]!.evidenceIds = ["evidence-q1"];
    expect(parseReportSemanticReviewOutput(refs, input).fields[0])
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation", evidenceIds: [], sourceIds: ["source-global"] });

    const terms = validReview(input);
    reviewFields(terms)[0]!.retainedOriginalTerms = [
      { term: "Brand", reason: "First" },
      { term: "Brand", reason: "Second" }
    ];
    expect(parseReportSemanticReviewOutput(terms, input).fields[0])
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation", retainedOriginalTerms: [] });

    const missingRefs = validReview(input);
    reviewFields(missingRefs)[1]!.evidenceIds = [];
    reviewFields(missingRefs)[1]!.sourceIds = [];
    const degraded = parseReportSemanticReviewOutput(missingRefs, input);
    expect(degraded.fields[1]).toMatchObject({
      decision: "pass",
      reason: "degraded: contract violation",
      evidenceIds: ["evidence-q1"],
      sourceIds: ["source-q1"]
    });
    expect(applyReportSemanticReview(input, degraded).fields[1]!.appliedText).toBe(input.fields[1]!.originalText);
  });

  it("synthesizes non-pass fields without issue codes and recomputes the overall decision", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const noCode = validReview(input);
    reviewFields(noCode)[0]!.decision = "blocked";
    noCode.overallDecision = "blocked";
    const degraded = parseReportSemanticReviewOutput(noCode, input);
    expect(degraded.fields[0]).toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(degraded.overallDecision).toBe("pass");

    const wrongOverall = validReview(input);
    wrongOverall.overallDecision = "corrected";
    expect(parseReportSemanticReviewOutput(wrongOverall, input).overallDecision).toBe("pass");
  });

  it("binds semantic duplicate decisions to known immutable questions", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const duplicate = validReview(input);
    duplicate.questionDistinctness = {
      decision: "duplicate",
      duplicateGroups: [["question-1", "question-2"]],
      reason: "The two questions request the same decision information."
    };
    duplicate.overallDecision = "blocked";
    expect(parseReportSemanticReviewOutput(duplicate, input).questionDistinctness.decision).toBe("duplicate");

    const unknown = structuredClone(duplicate);
    (unknown.questionDistinctness as Record<string, unknown>).duplicateGroups = [["question-1", "question-4"]];
    expect(() => parseReportSemanticReviewOutput(unknown, input)).toThrow(/unknown question/u);

    const overlap = structuredClone(duplicate);
    (overlap.questionDistinctness as Record<string, unknown>).duplicateGroups = [
      ["question-1", "question-2"],
      ["question-2", "question-3"]
    ];
    expect(() => parseReportSemanticReviewOutput(overlap, input)).toThrow(/must not overlap/u);
  });

  it("rejects unknown output keys and malformed correction shapes", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const unknown = { ...validReview(input), unexpected: true };
    expect(() => parseReportSemanticReviewOutput(unknown, input)).toThrow(/unknown key/u);

    const passWithCorrection = validReview(input);
    reviewFields(passWithCorrection)[0]!.correctedText = "Not allowed";
    expect(parseReportSemanticReviewOutput(passWithCorrection, input).fields[0])
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
  });
});

describe("ReportSemanticReview receipt integrity", () => {
  it("keeps a nonresponsive answer annotation without blocking the Free decision and hashes annotations in the receipt", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    (review.annotations as Record<string, unknown>).answers = [{ questionId: "question-1", relevance: "not_responsive", entityRole: "none", targetPresence: "absent", targetFirstSentence: null, targetRoles: [], competitorEntityIds: [], evidenceIds: [], sourceIds: [], reason: "does not answer" }];
    const parsed = parseReportSemanticReviewOutput(review, input);
    expect(parsed.annotations.answers[0]!.relevance).toBe("not_responsive");
    expect(parsed.overallDecision).toBe("pass");
    const applied = applyReportSemanticReview(input, validReview(input));
    expect(() => verifyReportSemanticReviewReceipt({ ...applied.receipt, annotationsHash: "a".repeat(64) }, input, validReview(input), applied.fields)).toThrow(/annotationsHash/u);
  });

  it("counts each observation once per independent target and competitor axis", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = parseReportSemanticReviewOutput(validReview(input), input);
    expect(deriveFreeObservationMetrics(review)).toEqual({ targetMentionCount: 1, competitorMentionCount: 1 });
  });

  it("deduplicates two result rows for one observation and excludes ambiguous-only observations", () => {
    const core = inputCore();
    core.observationResults.push(
      { observationId: "observation-1", resultId: "result-2", questionId: "question-1", originalText: "competitor", originalTextHash: reportSemanticTextHash("competitor") },
      { observationId: "observation-2", resultId: "result-3", questionId: "question-1", originalText: "uncertain", originalTextHash: reportSemanticTextHash("uncertain") }
    );
    const input = createReportSemanticReviewInput(core);
    const review = validReview(input);
    (review.annotations as Record<string, unknown>).observationResults = [
      { observationId: "observation-1", resultId: "result-1", targetPresence: "present", competitorPresence: "absent", reason: "target" },
      { observationId: "observation-1", resultId: "result-2", targetPresence: "absent", competitorPresence: "present", reason: "competitor" },
      { observationId: "observation-2", resultId: "result-3", targetPresence: "ambiguous", competitorPresence: "ambiguous", reason: "uncertain" }
    ];
    expect(deriveFreeObservationMetrics(parseReportSemanticReviewOutput(review, input))).toEqual({ targetMentionCount: 1, competitorMentionCount: 1 });
  });

  it("sanitizes extra or reordered answer annotations and same-question references outside the owned field", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const extra = validReview(input);
    (extra.annotations as Record<string, unknown>).answers = [...(extra.annotations as { answers: unknown[] }).answers, structuredClone((extra.annotations as { answers: unknown[] }).answers[0])];
    const parsedExtra = parseReportSemanticReviewOutput(extra, input);
    expect(parsedExtra.annotations.answers).toHaveLength(input.answerSubjects.length);
    const disallowed = validReview(input);
    (disallowed.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.sourceIds = ["source-global"];
    const parsedDisallowed = parseReportSemanticReviewOutput(disallowed, input);
    expect(parsedDisallowed.annotations.answers[0]!.sourceIds).toEqual([]);
    expect(parsedDisallowed.annotations.answers[0]!.evidenceIds).toEqual(["evidence-q1"]);

    const core = inputCore();
    const sourceText = "Q2 source";
    core.sources.push({ sourceId: "source-q2", questionId: "question-2", canonicalUrl: "https://provider.example/q2", originalText: sourceText, originalTextHash: reportSemanticTextHash(sourceText) });
    const evidenceText = "Q2 evidence";
    core.evidence.push({ evidenceId: "evidence-q2", questionId: "question-2", sourceId: "source-q2", originalText: evidenceText, originalTextHash: reportSemanticTextHash(evidenceText) });
    core.fields.push(manifestField("answerCards[1].answerText", "Q2 answer", "question-2", ["evidence-q2"], ["source-q2"]));
    core.answerSubjects.push({ questionId: "question-2", fieldPath: "answerCards[1].answerText" });
    const orderedInput = createReportSemanticReviewInput(core);
    const reordered = validReview(orderedInput);
    (reordered.annotations as { answers: unknown[] }).answers.reverse();
    const parsedReordered = parseReportSemanticReviewOutput(reordered, orderedInput);
    expect(parsedReordered.annotations.answers.map(({ questionId }) => questionId))
      .toEqual(orderedInput.answerSubjects.map(({ questionId }) => questionId));
  });

  it("filters competitor annotations that are not bound to the exact entity catalog", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    (review.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.competitorEntityIds = ["unknown-competitor"];
    expect(parseReportSemanticReviewOutput(review, input).annotations.answers[0]!.competitorEntityIds).toEqual([]);

    const crossOwnedCore = inputCore();
    crossOwnedCore.entities[0]!.questionId = "question-2";
    const crossOwnedInput = createReportSemanticReviewInput(crossOwnedCore);
    const crossOwnedReview = validReview(crossOwnedInput);
    (crossOwnedReview.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.competitorEntityIds = ["competitor-1"];
    expect(parseReportSemanticReviewOutput(crossOwnedReview, crossOwnedInput).annotations.answers[0]!.competitorEntityIds).toEqual([]);
  });

  it("degrades internally inconsistent target-presence details", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const zeroSentence = validReview(input);
    (zeroSentence.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.targetFirstSentence = 0;
    expect(parseReportSemanticReviewOutput(zeroSentence, input).annotations.answers[0])
      .toMatchObject({ targetPresence: "present", targetFirstSentence: 1, reason: "degraded: contract violation", degraded: true });

    const absentWithRole = validReview(input);
    Object.assign((absentWithRole.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!, {
      targetPresence: "absent",
      targetFirstSentence: null,
      targetRoles: ["subject"]
    });
    expect(parseReportSemanticReviewOutput(absentWithRole, input).annotations.answers[0])
      .toMatchObject({ targetPresence: "present", targetFirstSentence: 1, reason: "degraded: contract violation", degraded: true });
  });

  it("exposes a structured degradation marker that survives re-parse and never crosses the Paid boundary", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const malformed = validReview(input);
    (malformed.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.targetFirstSentence = 0;
    const parsed = parseReportSemanticReviewOutput(malformed, input);
    expect(parsed.annotations.answers[0]).toMatchObject({ degraded: true, reason: "degraded: contract violation" });

    // The marker round-trips when the sanitized output is re-parsed, so the
    // receipt hashes over the persisted projection stay stable.
    const reparsed = parseReportSemanticReviewOutput(parsed, input);
    expect(reparsed.annotations.answers[0]).toMatchObject({ degraded: true });
    expect(hashReportSemanticReviewValue(reparsed.annotations)).toBe(hashReportSemanticReviewValue(parsed.annotations));

    // Valid model rows never acquire the marker.
    const valid = parseReportSemanticReviewOutput(validReview(input), input);
    expect(valid.annotations.answers[0]).not.toHaveProperty("degraded");

    // The strict Paid report_global_v1 parser keeps rejecting the marker key.
    const paidInput = globalInput();
    const paidReview = globalReview(paidInput);
    (paidReview.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.degraded = true;
    expect(() => parseReportSemanticReviewOutput(paidReview, paidInput)).toThrow(/unknown key degraded/u);
  });

  it("rejects observation text hash drift and cross-question observation reuse", () => {
    const drift = inputCore();
    drift.observationResults[0]!.originalTextHash = "a".repeat(64);
    expect(() => createReportSemanticReviewInput(drift)).toThrow(/originalTextHash/u);
    const reused = inputCore();
    reused.observationResults.push({ observationId: "observation-1", resultId: "result-2", questionId: "question-2", originalText: "other", originalTextHash: reportSemanticTextHash("other") });
    expect(() => createReportSemanticReviewInput(reused)).toThrow(/inconsistent question ownership/u);
  });
  it("rejects non-prose drift at application and verification", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    expect(() => applyReportSemanticReview(input, review, "a".repeat(64))).toThrow(/non-prose projection changed/u);

    const applied = applyReportSemanticReview(input, review);
    expect(() => verifyReportSemanticReviewReceipt(applied.receipt, input, review, applied.fields, "a".repeat(64)))
      .toThrow(/currentNonProseProjectionHash/u);
  });

  it.each([
    ["input", "inputHash"],
    ["review", "reviewHash"],
    ["coverage", "fieldCoverageHash"],
    ["prose", "appliedProseHash"],
    ["non-prose", "nonProseProjectionHash"]
  ])("rejects a tampered %s receipt hash", (_name, key) => {
    const input = createReportSemanticReviewInput(inputCore());
    const applied = applyReportSemanticReview(input, validReview(input));
    const receipt = { ...applied.receipt, [key]: "a".repeat(64) };
    expect(() => verifyReportSemanticReviewReceipt(receipt, input, validReview(input), applied.fields)).toThrow();
  });

  it("rejects altered applied text and incomplete receipt field coverage", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const applied = applyReportSemanticReview(input, validReview(input));
    const alteredFields = structuredClone(applied.fields) as unknown as Array<Record<string, unknown>>;
    alteredFields[0]!.appliedText = "Altered text";
    expect(() => verifyReportSemanticReviewReceipt(applied.receipt, input, validReview(input), alteredFields as never))
      .toThrow(/appliedTextHash/u);

    const receipt = { ...applied.receipt, fields: applied.receipt.fields.slice(1) };
    expect(() => verifyReportSemanticReviewReceipt(receipt, input, validReview(input), applied.fields))
      .toThrow(/complete input manifest/u);
  });

  it("rejects applied fields that do not match the bound reviewed correction", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    const result = reviewFields(review)[0]!;
    result.decision = "corrected";
    result.correctedText = "经审核修正后的客户摘要。";
    result.issueCodes = ["language_quality"];
    review.overallDecision = "corrected";
    const applied = applyReportSemanticReview(input, review);
    const fields = structuredClone(applied.fields) as unknown as Array<Record<string, unknown>>;
    fields[0]!.decision = "pass";
    fields[0]!.appliedText = input.fields[0]!.originalText;
    fields[0]!.appliedTextHash = input.fields[0]!.originalTextHash;
    expect(() => verifyReportSemanticReviewReceipt(applied.receipt, input, review, fields as never))
      .toThrow(/does not match its reviewed result/u);
  });
});

function inputCore(): MutableInputCore {
  const question = (questionId: string, originalText: string) => ({
    questionId,
    originalText,
    originalTextHash: reportSemanticTextHash(originalText)
  });
  const sourceText = "Shun Express顺心捷达 provides documented FBA first-mile services.";
  const evidenceText = "The service page states that FBA first-mile transport is available.";
  const fields: Array<Mutable<ReportSemanticFieldManifestEntry>> = [
    manifestField("executiveSummary.overview", "该网站介绍了跨境物流服务。", null, [], ["source-global"]),
    manifestField(
      "answerCards[0].answerText",
      "Shun Express顺心捷达提供FBA头程服务。",
      "question-1",
      ["evidence-q1"],
      ["source-q1"]
    ),
    { ...manifestField("questions[0].text", "哪些服务商提供FBA头程服务？", "question-1", [], []), mutability: "read_only" }
  ];
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    lifecycle: "paid_v3",
    authorityBindings: {
      rootMarker: REPORT_SEMANTIC_REVIEW_CONTRACT,
      artifactIdentityHash: hashReportSemanticReviewValue({ binding: "artifactIdentity" }),
      reviewedFreeAuthorityHash: hashReportSemanticReviewValue({ binding: "reviewedFreeAuthority" }),
      answerCheckpointHash: hashReportSemanticReviewValue({ binding: "answerCheckpoint" }),
      commercialSnapshotsHash: hashReportSemanticReviewValue({ binding: "commercialSnapshots" }),
      publicSourceHash: hashReportSemanticReviewValue({ binding: "publicSource" }),
      providerDiscoveryHash: hashReportSemanticReviewValue({ binding: "providerDiscovery" }),
      technicalFoundationHash: hashReportSemanticReviewValue({ binding: "technicalFoundation" }),
      aiFoundationHash: hashReportSemanticReviewValue({ binding: "aiFoundation" }),
      evidenceAssetsHash: hashReportSemanticReviewValue({ binding: "evidenceAssets" })
    },
    locale: "zh-CN",
    target: {
      siteKey: "shun-express.com",
      targetUrl: "https://shun-express.com/",
      aliases: ["Shun Express顺心捷达"]
    },
    expectedModel: { providerId: "mimo", modelId: "mimo-v2.5-pro" },
    questions: [
      question("question-1", "哪些服务商提供FBA头程服务？"),
      question("question-2", "哪些服务商覆盖目标地区？"),
      question("question-3", "采购方需要核验哪些交付风险？")
    ],
    sources: [
      {
        sourceId: "source-q1",
        questionId: "question-1",
        canonicalUrl: "https://provider.example/fba",
        originalText: sourceText,
        originalTextHash: reportSemanticTextHash(sourceText)
      },
      {
        sourceId: "source-global",
        questionId: null,
        canonicalUrl: "https://shun-express.com/about",
        originalText: "The company profile describes cross-border logistics services.",
        originalTextHash: reportSemanticTextHash("The company profile describes cross-border logistics services.")
      }
    ],
    evidence: [{
      evidenceId: "evidence-q1",
      questionId: "question-1",
      sourceId: "source-q1",
      originalText: evidenceText,
      originalTextHash: reportSemanticTextHash(evidenceText)
    }],
    observationResults: [{ observationId: "observation-1", resultId: "result-1", questionId: "question-1", originalText: "Target and a competitor appear together.", originalTextHash: reportSemanticTextHash("Target and a competitor appear together.") }],
    entities: [{ entityId: "competitor-1", questionId: "question-1", kind: "competitor_candidate", originalText: "Competitor", originalTextHash: reportSemanticTextHash("Competitor") }],
    answerSubjects: [{ questionId: "question-1", fieldPath: "answerCards[0].answerText" }],
    fields,
    nonProseProjectionHash: hashReportSemanticReviewValue({ reportId: "report-1", questionIds: [1, 2, 3] })
  };
}

function manifestField(
  path: string,
  originalText: string,
  questionId: string | null,
  allowedEvidenceIds: string[],
  allowedSourceIds: string[]
): Mutable<ReportSemanticFieldManifestEntry> {
  return {
    path,
    originalText,
    originalTextHash: reportSemanticTextHash(originalText),
    mutability: "mutable",
    questionId,
    allowedEvidenceIds,
    allowedSourceIds
  };
}

function freeInput(): ReportSemanticReviewInput {
  const core = inputCore();
  core.lifecycle = "free_v4";
  return createReportSemanticReviewInput(core);
}

function globalInput(): ReportSemanticReviewInput {
  const core = inputCore();
  core.lifecycle = "free_v4";
  core.evidencePolicy = "report_global_v1";
  core.sources[0]!.eligible = true;
  core.evidence[0]!.eligible = true;
  core.evidence.push(
    { evidenceId: "global-extra", questionId: "question-2", sourceId: null, originalText: "Eligible global evidence.", originalTextHash: reportSemanticTextHash("Eligible global evidence."), eligible: true },
    { evidenceId: "ineligible", questionId: "question-2", sourceId: null, originalText: "Ineligible evidence.", originalTextHash: reportSemanticTextHash("Ineligible evidence."), eligible: false },
    { evidenceId: "missing-eligibility", questionId: "question-2", sourceId: null, originalText: "Missing eligibility.", originalTextHash: reportSemanticTextHash("Missing eligibility.") }
  );
  for (const field of core.fields) {
    field.allowedEvidenceIds = [];
    field.allowedSourceIds = [];
  }
  return createReportSemanticReviewInput(core);
}

/** Paid V3 + report_global_v1 — same catalog shape as Free global, lifecycle paid_v3. */
function paidGlobalInput(): ReportSemanticReviewInput {
  const core = inputCore();
  core.lifecycle = "paid_v3";
  core.evidencePolicy = "report_global_v1";
  core.sources[0]!.eligible = true;
  core.evidence[0]!.eligible = true;
  core.evidence.push(
    { evidenceId: "global-extra", questionId: "question-2", sourceId: null, originalText: "Eligible global evidence.", originalTextHash: reportSemanticTextHash("Eligible global evidence."), eligible: true },
    { evidenceId: "ineligible", questionId: "question-2", sourceId: null, originalText: "Ineligible evidence.", originalTextHash: reportSemanticTextHash("Ineligible evidence."), eligible: false },
    { evidenceId: "missing-eligibility", questionId: "question-2", sourceId: null, originalText: "Missing eligibility.", originalTextHash: reportSemanticTextHash("Missing eligibility.") }
  );
  for (const field of core.fields) {
    field.allowedEvidenceIds = [];
    field.allowedSourceIds = [];
  }
  return createReportSemanticReviewInput(core);
}

function globalReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  const review = validReview(input);
  for (const field of reviewFields(review)) {
    field.evidenceIds = ["evidence-q1"];
    field.sourceIds = [];
    field.rejectedEvidence = [{ evidenceId: "global-extra", reason: "Not needed for this conclusion." }];
    field.rejectedSources = [];
  }
  const annotations = review.annotations as { answers: Array<Record<string, unknown>>; evidenceUse: Array<Record<string, unknown>> };
  for (const answer of annotations.answers) {
    answer.evidenceIds = ["evidence-q1"];
    answer.sourceIds = [];
  }
  for (const use of annotations.evidenceUse) {
    use.evidenceIds = ["evidence-q1"];
    use.sourceIds = [];
  }
  return review;
}

function validReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    inputHash: input.inputHash,
    providerId: input.expectedModel.providerId,
    modelId: input.expectedModel.modelId,
    fields: input.fields.map((field) => ({
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "pass",
      issueCodes: [],
      reason: "The prose is natural, responsive, and faithful to its bound evidence.",
      evidenceIds: field.allowedEvidenceIds,
      sourceIds: field.allowedSourceIds,
      retainedOriginalTerms: []
    })),
    questionDistinctness: {
      decision: "distinct",
      duplicateGroups: [],
      reason: "The three questions request different buyer decisions."
    },
    annotations: {
      observationResults: [{ observationId: "observation-1", resultId: "result-1", targetPresence: "present", competitorPresence: "present", reason: "The supplied result identifies both entities." }],
      answers: input.answerSubjects.map((subject) => ({ questionId: subject.questionId, relevance: "responsive", entityRole: "target", targetPresence: "present", targetFirstSentence: 1, targetRoles: ["answer subject"], competitorEntityIds: [], evidenceIds: subject.questionId === "question-1" ? ["evidence-q1"] : ["evidence-q2"], sourceIds: subject.questionId === "question-1" ? ["source-q1"] : ["source-q2"], reason: "The answer is bound to this question." })),
      evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: field.allowedEvidenceIds, sourceIds: field.allowedSourceIds, reason: "Uses only the bound catalog references." }))
    },
    overallDecision: "pass"
  };
}

function reviewFields(review: Record<string, unknown>): Array<Record<string, unknown>> {
  return review.fields as Array<Record<string, unknown>>;
}

type MutableInputCore = {
  -readonly [Key in keyof ReportSemanticReviewInputCore]: ReportSemanticReviewInputCore[Key] extends readonly (infer Item)[]
    ? Array<Mutable<Item>>
    : Mutable<ReportSemanticReviewInputCore[Key]>;
};

type Mutable<Value> = Value extends object
  ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
  : Value;


describe("Free V4 batched causal identity evidence (C7/C9)", () => {
  function identityCore(): MutableInputCore {
    const core = inputCore();
    core.lifecycle = "free_v4";
    const sourceText = "Q2 source";
    core.sources.push({ sourceId: "source-q2", questionId: "question-2", canonicalUrl: "https://provider.example/q2", originalText: sourceText, originalTextHash: reportSemanticTextHash(sourceText) });
    const evidenceText = "Q2 evidence";
    core.evidence.push({ evidenceId: "evidence-q2", questionId: "question-2", sourceId: "source-q2", originalText: evidenceText, originalTextHash: reportSemanticTextHash(evidenceText) });
    core.fields.push(manifestField("answerCards[1].answerText", "Q2 answer", "question-2", ["evidence-q2"], ["source-q2"]));
    core.answerSubjects.push({ questionId: "question-2", fieldPath: "answerCards[1].answerText" });
    core.observationResults.push(
      { observationId: "observation-2", resultId: "result-2", questionId: "question-2", originalText: "obs two", originalTextHash: reportSemanticTextHash("obs two") },
      { observationId: "observation-3", resultId: "result-3", questionId: "question-3", originalText: "obs three", originalTextHash: reportSemanticTextHash("obs three") }
    );
    return core;
  }

  function markerPayloads(input: ReportSemanticReviewInput): Record<FreeV4SemanticReviewBatchId, unknown> {
    const full = validReview(input) as { fields: Array<Record<string, unknown>> };
    return {
      B_fields_readonly: { fields: full.fields.filter((row) => input.fields.find((manifest) => manifest.path === row.path)?.mutability === "read_only") },
      B_fields_mutable: { fields: full.fields.filter((row) => input.fields.find((manifest) => manifest.path === row.path)?.mutability === "mutable") },
      B_obs: { observationResults: input.observationResults.map((row) => ({ observationId: row.observationId, resultId: row.resultId, targetPresence: "present", competitorPresence: "absent", reason: `MODEL-ROW ${row.observationId}` })) },
      B_answers: { answers: input.answerSubjects.map((subject) => ({ questionId: subject.questionId, relevance: "responsive", entityRole: "target", targetPresence: "present", targetFirstSentence: 1, targetRoles: ["answer subject"], competitorEntityIds: [], evidenceIds: subject.questionId === "question-1" ? ["evidence-q1"] : ["evidence-q2"], sourceIds: subject.questionId === "question-1" ? ["source-q1"] : ["source-q2"], reason: `MODEL-ROW ${subject.questionId}` })) },
      B_evidence_use: { evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: [...field.allowedEvidenceIds], sourceIds: [...field.allowedSourceIds], reason: `MODEL-ROW ${field.path}` })) }
    };
  }

  async function reviewWithPayloads(input: ReportSemanticReviewInput, payloads: Record<FreeV4SemanticReviewBatchId, unknown>) {
    const result = await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => payloads[batchId]);
    return result.review;
  }

  it("anchors reordered B_answers rows by echoed questionId so each verdict lands on its own subject", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const payloads = markerPayloads(input);
    const rows = (payloads.B_answers as { answers: unknown[] }).answers;
    payloads.B_answers = { answers: [rows[1], rows[0]] };
    const review = await reviewWithPayloads(input, payloads);
    // Echoed-identity anchoring (C7): the reorder is harmless — each verdict
    // lands on the subject whose questionId the row echoed, references intact.
    expect(review.annotations.answers.map((row) => row.questionId)).toEqual(["question-1", "question-2"]);
    expect(review.annotations.answers[0]).toMatchObject({ questionId: "question-1", reason: "MODEL-ROW question-1", evidenceIds: ["evidence-q1"], sourceIds: ["source-q1"] });
    expect(review.annotations.answers[0]!.degraded).toBeUndefined();
    expect(review.annotations.answers[1]).toMatchObject({ questionId: "question-2", reason: "MODEL-ROW question-2", evidenceIds: ["evidence-q2"], sourceIds: ["source-q2"] });
    expect(review.annotations.answers[1]!.degraded).toBeUndefined();
  });

  it("rejects a B_answers row with an unknown, corrupted, duplicated, or missing echoed questionId", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const rows = () => (markerPayloads(input).B_answers as { answers: Array<Record<string, unknown>> }).answers;
    const withAnswers = async (answers: unknown[]) =>
      reviewWithPayloads(input, { ...markerPayloads(input), B_answers: { answers } });
    await expect(withAnswers([{ ...rows()[0]!, questionId: "question-999" }, rows()[1]]))
      .rejects.toThrow(TypeError);
    await expect(withAnswers([{ ...rows()[0]!, questionId: "question-999" }, rows()[1]]))
      .rejects.toThrow(/echoes unknown questionId question-999/u);
    // The run-2 corruption pattern: "40" inserted into the echoed identity.
    await expect(withAnswers([{ ...rows()[0]!, questionId: "question-140" }, rows()[1]]))
      .rejects.toThrow(/echoes unknown questionId question-140/u);
    await expect(withAnswers([rows()[0], rows()[0], rows()[1]]))
      .rejects.toThrow(/duplicates questionId question-1/u);
    const missing = rows()[0]!;
    delete missing.questionId;
    await expect(withAnswers([missing, rows()[1]]))
      .rejects.toThrow(/must echo its questionId identity/u);
    await expect(withAnswers(["broken"]))
      .rejects.toThrow(/must be an object/u);
  });

  it("anchors a B_obs middle-row omission so present rows keep their verdicts and the omitted slot degrades", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const payloads = markerPayloads(input);
    const rows = (payloads.B_obs as { observationResults: unknown[] }).observationResults;
    payloads.B_obs = { observationResults: [rows[0], rows[2]] };
    const review = await reviewWithPayloads(input, payloads);
    // Echoed-identity anchoring (C7): the remaining rows land on their own
    // observations; only the omitted slot degrades to the synthesized fallback.
    expect(review.annotations.observationResults.map((row) => ({ observationId: row.observationId, reason: row.reason }))).toEqual([
      { observationId: "observation-1", reason: "MODEL-ROW observation-1" },
      { observationId: "observation-2", reason: "degraded: contract violation" },
      { observationId: "observation-3", reason: "MODEL-ROW observation-3" }
    ]);
    expect(review.annotations.observationResults[0]!.targetPresence).toBe("present");
    expect(review.annotations.observationResults[1]!.targetPresence).toBe("ambiguous");
    expect(review.annotations.observationResults[2]!.targetPresence).toBe("present");
  });

  it("anchors reordered B_obs rows by echoed observationId/resultId so each verdict lands on its own row", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const payloads = markerPayloads(input);
    const rows = (payloads.B_obs as { observationResults: unknown[] }).observationResults;
    payloads.B_obs = { observationResults: [rows[2], rows[0], rows[1]] };
    const review = await reviewWithPayloads(input, payloads);
    expect(review.annotations.observationResults.map((row) => `${row.observationId}:${row.resultId} <- ${row.reason}`)).toEqual([
      "observation-1:result-1 <- MODEL-ROW observation-1",
      "observation-2:result-2 <- MODEL-ROW observation-2",
      "observation-3:result-3 <- MODEL-ROW observation-3"
    ]);
    expect(review.annotations.observationResults.every((row) => row.targetPresence === "present")).toBe(true);
  });

  it("rejects a B_obs row with an unknown, corrupted, duplicated, or missing echoed observationId/resultId", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const rows = () => (markerPayloads(input).B_obs as { observationResults: Array<Record<string, unknown>> }).observationResults;
    const withObs = async (observationResults: unknown[]) =>
      reviewWithPayloads(input, { ...markerPayloads(input), B_obs: { observationResults } });
    // The run-2 corruption pattern: "40" inserted into the echoed resultId.
    await expect(withObs([rows()[0], { ...rows()[1]!, resultId: "result-240" }, rows()[2]]))
      .rejects.toThrow(/echoes unknown observation observation-2:result-240/u);
    await expect(withObs([rows()[0], rows()[0], rows()[1], rows()[2]]))
      .rejects.toThrow(/duplicates observation observation-1:result-1/u);
    const missing = rows()[0]!;
    delete missing.resultId;
    await expect(withObs([missing, rows()[1], rows()[2]]))
      .rejects.toThrow(/must echo its observation identity/u);
    await expect(withObs(["broken"]))
      .rejects.toThrow(TypeError);
  });

  it("anchors reordered B_evidence_use rows by echoed path so each verdict lands on its own field path", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const payloads = markerPayloads(input);
    const rows = (payloads.B_evidence_use as { evidenceUse: unknown[] }).evidenceUse;
    payloads.B_evidence_use = { evidenceUse: [...rows].reverse() };
    const review = await reviewWithPayloads(input, payloads);
    // Echoed-identity anchoring (C7): the reversed rows land back on their own
    // paths, keeping each row's allowlist-bound references.
    expect(review.annotations.evidenceUse.map((row) => `${row.path} <- ${row.reason}`)).toEqual([
      "executiveSummary.overview <- MODEL-ROW executiveSummary.overview",
      "answerCards[0].answerText <- MODEL-ROW answerCards[0].answerText",
      "questions[0].text <- MODEL-ROW questions[0].text",
      "answerCards[1].answerText <- MODEL-ROW answerCards[1].answerText"
    ]);
    expect(review.annotations.evidenceUse[0]).toMatchObject({ evidenceIds: [], sourceIds: ["source-global"] });
    expect(review.annotations.evidenceUse[1]).toMatchObject({ evidenceIds: ["evidence-q1"], sourceIds: ["source-q1"] });
    expect(review.annotations.evidenceUse[3]).toMatchObject({ evidenceIds: ["evidence-q2"], sourceIds: ["source-q2"] });
  });

  it("rejects a B_evidence_use row with an unknown, duplicated, or missing echoed path", async () => {
    const input = createReportSemanticReviewInput(identityCore());
    const rows = () => (markerPayloads(input).B_evidence_use as { evidenceUse: Array<Record<string, unknown>> }).evidenceUse;
    const withUse = async (evidenceUse: unknown[]) =>
      reviewWithPayloads(input, { ...markerPayloads(input), B_evidence_use: { evidenceUse } });
    await expect(withUse([{ ...rows()[0]!, path: "executiveSummary.other" }, ...rows().slice(1)]))
      .rejects.toThrow(/echoes unknown path executiveSummary\.other/u);
    await expect(withUse([rows()[0], rows()[0], ...rows().slice(1)]))
      .rejects.toThrow(/duplicates path executiveSummary\.overview/u);
    const missing = rows()[0]!;
    delete missing.path;
    await expect(withUse([missing, ...rows().slice(1)]))
      .rejects.toThrow(/must echo its path identity/u);
  });

  it("rejects a positional B_answers anomaly instead of letting it land on annotations.answers[0], the slot the Q1 gate consumes (C9)", async () => {
    const input = freeInput();
    const payloads = markerPayloads(input);
    payloads.B_answers = {
      answers: [{
        questionId: "question-999",
        relevance: "responsive",
        entityRole: "none",
        targetPresence: "absent",
        targetFirstSentence: null,
        targetRoles: [],
        competitorEntityIds: [],
        evidenceIds: ["evidence-q1"],
        sourceIds: ["source-q1"],
        reason: "MODEL-ROW wrong-identity"
      }]
    };
    // Echoed-identity anchoring (C7): the unknown echoed questionId fails
    // closed with a TypeError instead of silently occupying
    // annotations.answers[0], the slot reviewFreeTeaser's Q1 gate consumes
    // positionally (apps/web/src/worker/report-v4-free-teaser.ts).
    await expect(reviewWithPayloads(input, payloads)).rejects.toThrow(TypeError);
    await expect(reviewWithPayloads(input, payloads)).rejects.toThrow(/echoes unknown questionId question-999/u);
  });
});
