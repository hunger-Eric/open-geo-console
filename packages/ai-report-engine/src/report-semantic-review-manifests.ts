import {
  applyReportSemanticReview,
  createReportSemanticReviewInput,
  parseReportSemanticReviewInput,
  reportSemanticTextHash,
  type AppliedReportSemanticReview,
  type ReportSemanticEvidence,
  type ReportSemanticEntity,
  type ReportSemanticExpectedModel,
  type ReportSemanticFieldManifestEntry,
  type ReportSemanticObservationResult,
  type ReportSemanticQuestion,
  type ReportSemanticReviewInput,
  type ReportSemanticSource,
  type ReportSemanticSourceSelectionCatalogEntry,
  type ReportSemanticTargetIdentity
} from "./report-semantic-review";

export interface ReportSemanticManifestFieldSeed {
  readonly path: string;
  readonly text: string;
  readonly mutability: "mutable" | "read_only";
  readonly questionId: string | null;
  readonly allowedEvidenceIds: readonly string[];
  readonly allowedSourceIds: readonly string[];
}

export interface ReportSemanticManifestSeed {
  readonly locale: string;
  readonly target: ReportSemanticTargetIdentity;
  readonly expectedModel: ReportSemanticExpectedModel;
  readonly questions: readonly ReportSemanticQuestion[];
  readonly sources: readonly ReportSemanticSource[];
  readonly evidence: readonly ReportSemanticEvidence[];
  readonly observationResults: readonly ReportSemanticObservationResult[];
  readonly entities?: readonly ReportSemanticEntity[];
  readonly answerSubjects: readonly import("./report-semantic-review").ReportSemanticAnswerSubject[];
  readonly sourceSelectionCatalog?: readonly ReportSemanticSourceSelectionCatalogEntry[];
  readonly fields: readonly ReportSemanticManifestFieldSeed[];
  readonly nonProseProjectionHash: string;
}

export interface AppliedPaidV3SemanticReview<T> extends AppliedReportSemanticReview {
  readonly report: T;
}

/** Pure caller-shaped manifest construction; it never inspects prose meaning. */
function buildReportSemanticReviewManifest(seed: ReportSemanticManifestSeed, lifecycle: "free_v4" | "paid_v3"): ReportSemanticReviewInput {
  const fields: ReportSemanticFieldManifestEntry[] = seed.fields.map((field) => ({
    path: field.path,
    originalText: field.text,
    originalTextHash: reportSemanticTextHash(field.text),
    mutability: field.mutability,
    questionId: field.questionId,
    allowedEvidenceIds: [...field.allowedEvidenceIds],
    allowedSourceIds: [...field.allowedSourceIds]
  }));
  return createReportSemanticReviewInput({
    version: "report-semantic-review-v1",
    lifecycle,
    locale: seed.locale,
    target: seed.target,
    expectedModel: seed.expectedModel,
    questions: seed.questions,
    sources: seed.sources,
    evidence: seed.evidence,
    observationResults: seed.observationResults,
    entities: seed.entities ?? [],
    answerSubjects: seed.answerSubjects,
    ...(seed.sourceSelectionCatalog ? { sourceSelectionCatalog: seed.sourceSelectionCatalog } : {}),
    fields,
    nonProseProjectionHash: seed.nonProseProjectionHash
  });
}

export function buildFreeV4SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest(seed, "free_v4");
}
export function buildPaidV3SemanticReviewManifest(seed: ReportSemanticManifestSeed): ReportSemanticReviewInput {
  return buildReportSemanticReviewManifest(seed, "paid_v3");
}

/**
 * Pure Paid V3 application. It can replace only manifest-declared string
 * leaves after the shared review contract has verified the full ordered
 * coverage and the caller-supplied non-prose projection hash.
 */
export function applyPaidV3SemanticReviewToReport<T>(
  report: T,
  rawInput: unknown,
  rawReview: unknown,
  currentNonProseProjectionHash: string
): AppliedPaidV3SemanticReview<T> {
  const input = parseReportSemanticReviewInput(rawInput);
  if (input.lifecycle !== "paid_v3") {
    throw new TypeError("Paid V3 semantic application requires a paid_v3 review input.");
  }
  const applied = applyReportSemanticReview(input, rawReview, currentNonProseProjectionHash);
  const cloned = cloneJsonValue(report);
  for (const [index, field] of applied.fields.entries()) {
    const manifest = input.fields[index]!;
    const current = readDeclaredPath(cloned, manifest.path);
    if (typeof current !== "string" || reportSemanticTextHash(current) !== manifest.originalTextHash) {
      throw new TypeError(`Paid V3 report field ${manifest.path} no longer matches its reviewed original text.`);
    }
    writeDeclaredPath(cloned, manifest.path, field.appliedText);
  }
  return { report: cloned, ...applied };
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function declaredPathSegments(path: string): Array<string | number> {
  if (!path || path.length > 1_000) throw new TypeError("A declared semantic field path is invalid.");
  const segments: Array<string | number> = [];
  const matcher = /(?:^|\.)([A-Za-z_$][A-Za-z0-9_$]*)|\[(\d+)\]/gu;
  let offset = 0;
  for (const match of path.matchAll(matcher)) {
    if (match.index !== offset) throw new TypeError(`Declared semantic field path ${path} is invalid.`);
    const key = match[1];
    if (key !== undefined) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new TypeError(`Declared semantic field path ${path} contains a prohibited segment.`);
      }
      segments.push(key);
    } else {
      segments.push(Number(match[2]));
    }
    offset = match.index + match[0].length;
  }
  if (offset !== path.length || segments.length === 0) {
    throw new TypeError(`Declared semantic field path ${path} is invalid.`);
  }
  return segments;
}

function readDeclaredPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of declaredPathSegments(path)) {
    if (!current || typeof current !== "object" || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new TypeError(`Paid V3 report is missing declared semantic field ${path}.`);
    }
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function writeDeclaredPath(value: unknown, path: string, text: string): void {
  const segments = declaredPathSegments(path);
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    current = (current as Record<string | number, unknown>)[segment];
  }
  (current as Record<string | number, unknown>)[segments.at(-1)!] = text;
}
