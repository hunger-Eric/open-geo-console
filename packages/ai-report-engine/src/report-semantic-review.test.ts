import { describe, expect, it } from "vitest";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  applyReportSemanticReview,
  buildPaidV3ReportSemanticReviewSystemPrompt,
  buildReportSemanticReviewSystemPrompt,
  createReportSemanticReviewInput,
  hashReportSemanticReviewValue,
  parseReportSemanticReviewInput,
  parseReportSemanticReviewOutput,
  reportSemanticTextHash,
  verifyReportSemanticReviewReceipt,
  deriveFreeObservationMetrics,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewInputCore
} from "./report-semantic-review";

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

  it("accepts a blocked review as evidence but refuses to apply it", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    const result = reviewFields(review)[0]!;
    result.decision = "blocked";
    result.issueCodes = ["unsupported_causal_claim"];
    result.reason = "The claim is not supported by the bound evidence.";
    review.overallDecision = "blocked";

    expect(parseReportSemanticReviewOutput(review, input).overallDecision).toBe("blocked");
    expect(() => applyReportSemanticReview(input, review)).toThrow(/blocked semantic review/u);
  });

  it.each([
    ["missing", (fields: Array<Record<string, unknown>>) => { fields.pop(); }],
    ["extra", (fields: Array<Record<string, unknown>>) => { fields.push(structuredClone(fields[0]!)); }],
    ["reordered", (fields: Array<Record<string, unknown>>) => { fields.reverse(); }],
    ["duplicate", (fields: Array<Record<string, unknown>>) => { fields[1] = structuredClone(fields[0]!); }]
  ])("rejects %s field coverage", (_name, mutate) => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    mutate(reviewFields(review));
    expect(() => parseReportSemanticReviewOutput(review, input)).toThrow(/cover|path/u);
  });

  it("rejects model identity and original-text hash tampering", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const model = validReview(input);
    model.modelId = "another-model";
    expect(() => parseReportSemanticReviewOutput(model, input)).toThrow(/modelId/u);

    const textHash = validReview(input);
    reviewFields(textHash)[0]!.originalTextHash = "f".repeat(64);
    expect(() => parseReportSemanticReviewOutput(textHash, input)).toThrow(/originalTextHash/u);
  });

  it("rejects a correction to a read-only field or unchanged corrected text", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const immutable = validReview(input);
    const immutableField = reviewFields(immutable)[2]!;
    immutableField.decision = "corrected";
    immutableField.correctedText = "Different question";
    immutableField.issueCodes = ["question_rewrite"];
    immutable.overallDecision = "corrected";
    expect(() => parseReportSemanticReviewOutput(immutable, input)).toThrow(/read-only/u);

    const unchanged = validReview(input);
    const unchangedField = reviewFields(unchanged)[0]!;
    unchangedField.decision = "corrected";
    unchangedField.correctedText = input.fields[0]!.originalText;
    unchangedField.issueCodes = ["language"];
    unchanged.overallDecision = "corrected";
    expect(() => parseReportSemanticReviewOutput(unchanged, input)).toThrow(/must differ/u);
  });

  it("rejects disallowed evidence/source references and duplicate retained terms", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const refs = validReview(input);
    reviewFields(refs)[0]!.evidenceIds = ["evidence-q1"];
    expect(() => parseReportSemanticReviewOutput(refs, input)).toThrow(/disallowed reference/u);

    const terms = validReview(input);
    reviewFields(terms)[0]!.retainedOriginalTerms = [
      { term: "Brand", reason: "First" },
      { term: "Brand", reason: "Second" }
    ];
    expect(() => parseReportSemanticReviewOutput(terms, input)).toThrow(/unique/u);

    const missingRefs = validReview(input);
    reviewFields(missingRefs)[1]!.evidenceIds = [];
    reviewFields(missingRefs)[1]!.sourceIds = [];
    expect(() => parseReportSemanticReviewOutput(missingRefs, input)).toThrow(/at least one allowed/u);
  });

  it("requires non-pass issue codes and a mechanically consistent overall decision", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const noCode = validReview(input);
    reviewFields(noCode)[0]!.decision = "blocked";
    noCode.overallDecision = "blocked";
    expect(() => parseReportSemanticReviewOutput(noCode, input)).toThrow(/issueCodes/u);

    const wrongOverall = validReview(input);
    wrongOverall.overallDecision = "corrected";
    expect(() => parseReportSemanticReviewOutput(wrongOverall, input)).toThrow(/must equal pass/u);
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
    expect(() => parseReportSemanticReviewOutput(passWithCorrection, input)).toThrow(/allowed only/u);
  });
});

describe("ReportSemanticReview receipt integrity", () => {
  it("blocks a claimed pass for a nonresponsive answer and hashes annotations in the receipt", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    (review.annotations as Record<string, unknown>).answers = [{ questionId: "question-1", relevance: "not_responsive", entityRole: "none", targetPresence: "absent", targetFirstSentence: null, targetRoles: [], competitorEntityIds: [], evidenceIds: [], sourceIds: [], reason: "does not answer" }];
    expect(() => parseReportSemanticReviewOutput(review, input)).toThrow(/must equal blocked/u);
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

  it("rejects extra or reordered answer annotations and same-question references outside the owned field", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const extra = validReview(input);
    (extra.annotations as Record<string, unknown>).answers = [...(extra.annotations as { answers: unknown[] }).answers, structuredClone((extra.annotations as { answers: unknown[] }).answers[0])];
    expect(() => parseReportSemanticReviewOutput(extra, input)).toThrow(/cover every answer subject/u);
    const disallowed = validReview(input);
    (disallowed.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.sourceIds = ["source-global"];
    expect(() => parseReportSemanticReviewOutput(disallowed, input)).toThrow(/disallowed reference/u);

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
    expect(() => parseReportSemanticReviewOutput(reordered, orderedInput)).toThrow(/questionId/u);
  });

  it("rejects competitor annotations that are not bound to the exact entity catalog", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const review = validReview(input);
    (review.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.competitorEntityIds = ["unknown-competitor"];
    expect(() => parseReportSemanticReviewOutput(review, input)).toThrow(/competitorEntityIds|unknown-competitor/u);

    const crossOwnedCore = inputCore();
    crossOwnedCore.entities[0]!.questionId = "question-2";
    const crossOwnedInput = createReportSemanticReviewInput(crossOwnedCore);
    const crossOwnedReview = validReview(crossOwnedInput);
    (crossOwnedReview.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.competitorEntityIds = ["competitor-1"];
    expect(() => parseReportSemanticReviewOutput(crossOwnedReview, crossOwnedInput)).toThrow(/another question|competitorEntityIds/u);
  });

  it("requires internally consistent target-presence details", () => {
    const input = createReportSemanticReviewInput(inputCore());
    const zeroSentence = validReview(input);
    (zeroSentence.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!.targetFirstSentence = 0;
    expect(() => parseReportSemanticReviewOutput(zeroSentence, input)).toThrow(/positive/u);

    const absentWithRole = validReview(input);
    Object.assign((absentWithRole.annotations as { answers: Array<Record<string, unknown>> }).answers[0]!, {
      targetPresence: "absent",
      targetFirstSentence: null,
      targetRoles: ["subject"]
    });
    expect(() => parseReportSemanticReviewOutput(absentWithRole, input)).toThrow(/targetRoles.*empty/u);
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
