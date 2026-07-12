import {
  classifyCommercialCoverage,
  createAnswerEngineSurfaceKey,
  parseAnswerEngineSurface,
  parseAnswerQuestion,
  parseAnswerSnapshotCell,
  parseAnswerSnapshotRun,
  type AnswerSnapshotCell,
  type AnswerSnapshotRunContract,
  type CertificationAuthoritySnapshot,
  type CertifiedAnswerEngineSurface,
  type CommercialCoverageDecision,
  type GeneratedQuestionSet
} from "@open-geo-console/answer-engine-observer";
import {
  assessEvidenceGrade,
  validateOpportunityHypothesis,
  type CitationRetrievalState,
  type CitationSourceCategory,
  type EvidenceGrade,
  type RepeatedEvidencePattern
} from "@open-geo-console/citation-intelligence";
import type { AiWebsiteReportV1 } from "./types";
import { parseAiWebsiteReportV1 } from "./validation";

export const RECOMMENDATION_FORENSIC_REPORT_VERSION = 1 as const;

export interface ExecutiveVerdictContract {
  summary: string;
  customerMentioned: "yes" | "no" | "mixed" | "unknown";
  primaryGap: string;
  evidenceCellIds: string[];
}

export interface AnswerSnapshotMatrixContract {
  run: AnswerSnapshotRunContract;
  cells: AnswerSnapshotCell[];
  commercialCoverage: CommercialCoverageDecision;
}

export interface RecommendedEntityContract {
  entityId: string;
  name: string;
  resolutionStatus: "resolved" | "ambiguous" | "unresolved";
  supportingCellIds: string[];
}

export interface VerifiedCitationRetrievalContract {
  state: CitationRetrievalState;
  retrievedAt?: string;
  contentHash?: string;
  verifiedExcerpt?: string;
  mapping: "precise" | "association" | "none";
  supportedEntityIds: string[];
  answerQuote?: string;
}

export interface CitationSourceContract {
  id: string;
  cellId: string;
  url: string;
  title: string;
  category: CitationSourceCategory;
  providerOrder: number;
  retrieval: VerifiedCitationRetrievalContract;
}

export interface EvidenceGradeContract {
  evidenceId: string;
  citationSourceId: string;
  cellId: string;
  grade: EvidenceGrade;
  repeatedPattern?: RepeatedEvidencePattern;
}

export interface SourceCategoryBreakdownContract {
  category: CitationSourceCategory;
  sourceCount: number;
  citationSourceIds: string[];
}

export interface CustomerVsCompetitorGapContract {
  id: string;
  title: string;
  rationale: string;
  evidenceCellIds: string[];
  sourcePattern: string;
  suggestedAction: string;
  competitorEntityIds: string[];
}

export interface HomepageVsFullSiteBlindSpotContract {
  homepageSummary: string;
  fullSiteSummary: string;
  omissions: string[];
  contradictions: string[];
  confidenceChanges: string[];
  limitations: string[];
}

export interface ExecutivePriorityContract {
  order: 1 | 2 | 3;
  title: string;
  rationale: string;
  evidenceCellIds: string[];
}

export interface VendorTaskContract {
  id: string;
  vendor: "website" | "content" | "seo" | "communications" | "cross-functional";
  title: string;
  rationale: string;
  actions: string[];
  acceptanceCriteria: string[];
  evidenceCellIds: string[];
  retestQuestionIds: string[];
}

export interface VendorTaskPackageContract {
  version: "vendor-task-v1";
  tasks: VendorTaskContract[];
}

export interface CertificationProvenanceContract {
  surfaceKey: string;
  evidenceReference: string;
}

export interface ProvenanceAndLimitationsContract {
  generatedAt: string;
  locale: string;
  region: string;
  certificationAuthorityVersion: string;
  certificationCapturedAt: string;
  certificationProvenance: CertificationProvenanceContract[];
  limitations: string[];
  methodology: string;
}

export interface RecommendationForensicReportV1 {
  version: typeof RECOMMENDATION_FORENSIC_REPORT_VERSION;
  reportId: string;
  jobId: string;
  targetUrl: string;
  executiveVerdict: ExecutiveVerdictContract;
  generatedQuestions: GeneratedQuestionSet;
  answerSnapshotMatrix: AnswerSnapshotMatrixContract;
  recommendedEntities: RecommendedEntityContract[];
  citationSources: CitationSourceContract[];
  evidenceGrades: EvidenceGradeContract[];
  sourceCategoryBreakdown: SourceCategoryBreakdownContract[];
  customerVsCompetitorGaps: CustomerVsCompetitorGapContract[];
  homepageVsFullSiteBlindSpot: HomepageVsFullSiteBlindSpotContract;
  executivePriorities: [ExecutivePriorityContract, ExecutivePriorityContract, ExecutivePriorityContract];
  vendorTaskPackage: VendorTaskPackageContract;
  websiteFoundationAppendix: AiWebsiteReportV1;
  provenanceAndLimitations: ProvenanceAndLimitationsContract;
}

export class RecommendationForensicReportValidationError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "RecommendationForensicReportValidationError";
  }
}

export function parseRecommendationForensicReportV1(
  value: unknown,
  certificationAuthority: CertificationAuthoritySnapshot
): RecommendationForensicReportV1 {
  const authority = parseCertificationAuthority(certificationAuthority);
  const report = record(value, "$" );
  if (report.version !== RECOMMENDATION_FORENSIC_REPORT_VERSION) fail("$.version", "Expected recommendation-forensic version 1.");
  const reportId = text(report.reportId, "$.reportId");
  const jobId = text(report.jobId, "$.jobId");
  const targetUrl = httpUrl(report.targetUrl, "$.targetUrl");
  const provenance = parseProvenance(report.provenanceAndLimitations, authority);
  const questions = parseGeneratedQuestions(report.generatedQuestions);
  const matrix = parseAnswerSnapshotMatrix(report.answerSnapshotMatrix, {
    reportId, jobId, locale: provenance.locale, region: provenance.region, questions, authority
  });
  const succeededCells = new Map(
    matrix.cells.filter((cell): cell is Extract<AnswerSnapshotCell, { status: "succeeded" }> => cell.status === "succeeded")
      .map((cell) => [cell.id, cell])
  );
  validateCertificationProvenance(provenance.certificationProvenance, matrix.cells, authority);
  validateExecutiveVerdict(report.executiveVerdict, succeededCells);
  const recommendedEntities = validateRecommendedEntities(report.recommendedEntities, succeededCells);
  const citationSources = parseCitationSources(report.citationSources, succeededCells, recommendedEntities);
  validateEvidenceGrades(report.evidenceGrades, citationSources, succeededCells, recommendedEntities);
  validateSourceCategoryBreakdown(report.sourceCategoryBreakdown, citationSources);
  validateCustomerGaps(report.customerVsCompetitorGaps, succeededCells);
  validateBlindSpot(report.homepageVsFullSiteBlindSpot);
  validateExecutivePriorities(report.executivePriorities, succeededCells);
  validateVendorTaskPackage(report.vendorTaskPackage, succeededCells, new Set(questions.questions.map(({ id }) => id)));
  const appendix = guarded("$.websiteFoundationAppendix", () => parseAiWebsiteReportV1(report.websiteFoundationAppendix));
  if (appendix.tier !== "deep" || appendix.targetUrl !== targetUrl || appendix.provenance.locale !== provenance.locale) {
    fail("$.websiteFoundationAppendix", "Appendix must be the matching deep website-foundation report.");
  }
  return value as RecommendationForensicReportV1;
}

function parseCertificationAuthority(value: unknown): CertificationAuthoritySnapshot {
  if (!value) fail("CertificationAuthority", "An external certification authority snapshot is required.");
  const input = record(value, "CertificationAuthority");
  const authorityVersion = text(input.authorityVersion, "CertificationAuthority.authorityVersion");
  const capturedAt = timestamp(input.capturedAt, "CertificationAuthority.capturedAt");
  const certifications = array(input.certifications, "CertificationAuthority.certifications")
    .map((item, index) => parseCertification(item, index));
  if (certifications.some(({ evidence }) => Date.parse(evidence.certifiedAt) > Date.parse(capturedAt))) {
    fail("CertificationAuthority.certifications", "Certification cannot postdate the authority snapshot.");
  }
  const keys = certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface));
  if (new Set(keys).size !== keys.length) fail("CertificationAuthority.certifications", "Surface identities must be unique.");
  return { authorityVersion, capturedAt, certifications };
}

function parseCertification(value: unknown, index: number): CertifiedAnswerEngineSurface {
  const input = record(value, `CertificationAuthority.certifications[${index}]`);
  const surface = parseAnswerEngineSurface(input.surface);
  const evidence = record(input.evidence, `CertificationAuthority.certifications[${index}].evidence`);
  if (surface.certificationState !== "certified" || evidence.environment !== "protected_staging") {
    fail(`CertificationAuthority.certifications[${index}]`, "Expected protected-staging certification.");
  }
  return {
    surface,
    evidence: {
      environment: "protected_staging",
      certifiedAt: timestamp(evidence.certifiedAt, `CertificationAuthority.certifications[${index}].evidence.certifiedAt`),
      evidenceReference: text(evidence.evidenceReference, `CertificationAuthority.certifications[${index}].evidence.evidenceReference`)
    }
  };
}

function parseProvenance(value: unknown, authority: CertificationAuthoritySnapshot): ProvenanceAndLimitationsContract {
  const input = record(value, "$.provenanceAndLimitations");
  if (input.certificationAuthorityVersion !== authority.authorityVersion || input.certificationCapturedAt !== authority.capturedAt) {
    fail("$.provenanceAndLimitations", "Certification provenance must match the external CertificationAuthority snapshot.");
  }
  const certificationProvenance = array(input.certificationProvenance, "$.provenanceAndLimitations.certificationProvenance")
    .map((item, index) => {
      const entry = record(item, `$.provenanceAndLimitations.certificationProvenance[${index}]`);
      return {
        surfaceKey: text(entry.surfaceKey, `$.provenanceAndLimitations.certificationProvenance[${index}].surfaceKey`),
        evidenceReference: text(entry.evidenceReference, `$.provenanceAndLimitations.certificationProvenance[${index}].evidenceReference`)
      };
    });
  return {
    generatedAt: timestamp(input.generatedAt, "$.provenanceAndLimitations.generatedAt"),
    locale: text(input.locale, "$.provenanceAndLimitations.locale"),
    region: text(input.region, "$.provenanceAndLimitations.region"),
    certificationAuthorityVersion: authority.authorityVersion,
    certificationCapturedAt: authority.capturedAt,
    certificationProvenance,
    limitations: stringArray(input.limitations, "$.provenanceAndLimitations.limitations"),
    methodology: text(input.methodology, "$.provenanceAndLimitations.methodology")
  };
}

function parseGeneratedQuestions(value: unknown): GeneratedQuestionSet {
  const input = record(value, "$.generatedQuestions");
  if (input.version !== "purchase-v1") fail("$.generatedQuestions.version", "Expected purchase-v1.");
  const organizationName = text(input.organizationName, "$.generatedQuestions.organizationName");
  const brandAliases = stringArray(input.brandAliases, "$.generatedQuestions.brandAliases");
  const normalizedBrands = [organizationName, ...brandAliases].map((brand) => brand.toLocaleLowerCase());
  if (new Set(normalizedBrands).size !== normalizedBrands.length) fail("$.generatedQuestions.brandAliases", "Brands must be unique.");
  if (input.confidence !== "high" && input.confidence !== "low") fail("$.generatedQuestions.confidence", "Expected high or low.");
  if (input.confidence === "low" && input.fallbackReason !== "insufficient_category_evidence") {
    fail("$.generatedQuestions.fallbackReason", "Low confidence requires an explicit fallback reason.");
  }
  if (input.confidence === "high" && input.fallbackReason !== undefined) {
    fail("$.generatedQuestions.fallbackReason", "High confidence cannot declare a fallback.");
  }
  const questions = array(input.questions, "$.generatedQuestions.questions").map(parseAnswerQuestion);
  if (questions.length < 3 || questions.length > 5 || new Set(questions.map(({ id }) => id)).size !== questions.length) {
    fail("$.generatedQuestions.questions", "Expected three to five unique questions.");
  }
  for (const [index, question] of questions.entries()) {
    const normalized = question.exactText.toLocaleLowerCase();
    if (normalizedBrands.some((brand) => normalized.includes(brand))) {
      fail(`$.generatedQuestions.questions[${index}]`, "Question contains an organization brand or alias.");
    }
  }
  return {
    version: "purchase-v1", organizationName, brandAliases, confidence: input.confidence,
    ...(input.fallbackReason === undefined ? {} : { fallbackReason: input.fallbackReason }),
    limitations: stringArray(input.limitations, "$.generatedQuestions.limitations"), questions
  } as GeneratedQuestionSet;
}

function parseAnswerSnapshotMatrix(
  value: unknown,
  context: {
    reportId: string;
    jobId: string;
    locale: string;
    region: string;
    questions: GeneratedQuestionSet;
    authority: CertificationAuthoritySnapshot;
  }
): AnswerSnapshotMatrixContract {
  const input = record(value, "$.answerSnapshotMatrix");
  const run = parseAnswerSnapshotRun(input.run);
  if (run.reportId !== context.reportId || run.jobId !== context.jobId || run.locale !== context.locale ||
      run.region !== context.region || run.questionSetVersion !== context.questions.version) {
    fail("$.answerSnapshotMatrix.run", "Run identity does not match report provenance and generated questions.");
  }
  const questionIds = new Set(context.questions.questions.map(({ id }) => id));
  const cells = array(input.cells, "$.answerSnapshotMatrix.cells").map((item, index) => {
    const cell = parseAnswerSnapshotCell(item);
    if (cell.runId !== run.id || !questionIds.has(cell.questionId)) {
      fail(`$.answerSnapshotMatrix.cells[${index}]`, "Cell must belong to this run and question set.");
    }
    return cell;
  });
  if (new Set(cells.map(({ id }) => id)).size !== cells.length) fail("$.answerSnapshotMatrix.cells", "Cell IDs must be unique.");
  const suppliedCoverage = parseCommercialCoverage(input.commercialCoverage);
  const expectedCoverage = classifyCommercialCoverage(context.questions.questions, cells, context.authority);
  if (!sameCommercialCoverage(suppliedCoverage, expectedCoverage)) {
    fail("$.answerSnapshotMatrix.commercialCoverage", "Decision does not match the external CertificationAuthority.");
  }
  return { run, cells, commercialCoverage: expectedCoverage };
}

function validateCertificationProvenance(
  supplied: CertificationProvenanceContract[],
  cells: AnswerSnapshotCell[],
  authority: CertificationAuthoritySnapshot
): void {
  const executedSurfaceKeys = new Set(cells.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const expected = authority.certifications
    .filter(({ surface }) => executedSurfaceKeys.has(createAnswerEngineSurfaceKey(surface)))
    .map(({ surface, evidence }) => ({
      surfaceKey: createAnswerEngineSurfaceKey(surface), evidenceReference: evidence.evidenceReference
    }))
    .sort((left, right) => left.surfaceKey.localeCompare(right.surfaceKey));
  const normalized = [...supplied].sort((left, right) => left.surfaceKey.localeCompare(right.surfaceKey));
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    fail("$.provenanceAndLimitations.certificationProvenance", "Entries must exactly match executed externally certified surfaces.");
  }
}

function validateExecutiveVerdict(value: unknown, cells: Map<string, SucceededCell>): void {
  const input = record(value, "$.executiveVerdict");
  text(input.summary, "$.executiveVerdict.summary");
  text(input.primaryGap, "$.executiveVerdict.primaryGap");
  if (!new Set(["yes", "no", "mixed", "unknown"]).has(input.customerMentioned as string)) {
    fail("$.executiveVerdict.customerMentioned", "Unsupported mention outcome.");
  }
  validateCellIds(input.evidenceCellIds, "$.executiveVerdict.evidenceCellIds", cells);
}

function validateRecommendedEntities(
  value: unknown,
  cells: Map<string, SucceededCell>
): Map<string, RecommendedEntityContract> {
  const entities = array(value, "$.recommendedEntities");
  const result = new Map<string, RecommendedEntityContract>();
  entities.forEach((item, index) => {
    const entity = record(item, `$.recommendedEntities[${index}]`);
    const entityId = text(entity.entityId, `$.recommendedEntities[${index}].entityId`);
    if (result.has(entityId)) fail("$.recommendedEntities", "Entity IDs must be unique.");
    const name = text(entity.name, `$.recommendedEntities[${index}].name`);
    if (!new Set(["resolved", "ambiguous", "unresolved"]).has(entity.resolutionStatus as string)) {
      fail(`$.recommendedEntities[${index}].resolutionStatus`, "Unsupported resolution state.");
    }
    const supportingCellIds = validateCellIds(
      entity.supportingCellIds, `$.recommendedEntities[${index}].supportingCellIds`, cells, true
    );
    result.set(entityId, {
      entityId, name,
      resolutionStatus: entity.resolutionStatus as RecommendedEntityContract["resolutionStatus"],
      supportingCellIds
    });
  });
  return result;
}

function parseCitationSources(
  value: unknown,
  cells: Map<string, SucceededCell>,
  entities: Map<string, RecommendedEntityContract>
): Map<string, CitationSourceContract> {
  const result = new Map<string, CitationSourceContract>();
  array(value, "$.citationSources").forEach((item, index) => {
    const path = `$.citationSources[${index}]`;
    const input = record(item, path);
    const id = text(input.id, `${path}.id`);
    if (result.has(id)) fail(path, "Citation source IDs must be unique.");
    const cellId = text(input.cellId, `${path}.cellId`);
    const cell = cells.get(cellId);
    if (!cell) fail(`${path}.cellId`, "Citation source must reference a succeeded report cell.");
    const url = httpUrl(input.url, `${path}.url`);
    const providerSource = cell.sources.find((source) => source.url === url);
    if (!providerSource) fail(`${path}.url`, "Citation URL is not a provider-returned source for the referenced cell.");
    const providerOrder = nonNegativeInteger(input.providerOrder, `${path}.providerOrder`);
    if (providerOrder !== providerSource.providerOrder) fail(`${path}.providerOrder`, "Order does not match provider-returned source metadata.");
    const category = citationCategory(input.category, `${path}.category`);
    const retrieval = parseRetrieval(input.retrieval, `${path}.retrieval`, cell, entities);
    const title = text(input.title, `${path}.title`);
    if (title !== providerSource.title) fail(`${path}.title`, "Title does not match provider-returned source metadata.");
    result.set(id, { id, cellId, url, title, category, providerOrder, retrieval });
  });
  return result;
}

function parseRetrieval(
  value: unknown,
  path: string,
  cell: SucceededCell,
  entities: Map<string, RecommendedEntityContract>
): VerifiedCitationRetrievalContract {
  const input = record(value, path);
  const state = text(input.state, `${path}.state`) as CitationRetrievalState;
  if (!new Set(["available", "inaccessible", "expired", "not_retrieved"]).has(state)) fail(`${path}.state`, "Unsupported retrieval state.");
  const verifiedExcerpt = input.verifiedExcerpt === undefined ? undefined : text(input.verifiedExcerpt, `${path}.verifiedExcerpt`);
  if (verifiedExcerpt && verifiedExcerpt.length > 1_000) fail(`${path}.verifiedExcerpt`, "Excerpt exceeds 1000 characters.");
  const mapping = text(input.mapping, `${path}.mapping`) as VerifiedCitationRetrievalContract["mapping"];
  if (!new Set(["precise", "association", "none"]).has(mapping)) fail(`${path}.mapping`, "Unsupported evidence mapping.");
  const supportedEntityIds = stringArray(input.supportedEntityIds, `${path}.supportedEntityIds`);
  if (new Set(supportedEntityIds).size !== supportedEntityIds.length || supportedEntityIds.some((id) => !entities.has(id))) {
    fail(`${path}.supportedEntityIds`, "Expected unique recommended entity IDs.");
  }
  const answerQuote = input.answerQuote === undefined ? undefined : text(input.answerQuote, `${path}.answerQuote`);
  if (mapping === "precise" && (!answerQuote || !cell.answerText.includes(answerQuote))) {
    fail(`${path}.answerQuote`, "Precise mapping requires an exact quote from the observed answer.");
  }
  const result: VerifiedCitationRetrievalContract = {
    state,
    ...(input.retrievedAt === undefined ? {} : { retrievedAt: timestamp(input.retrievedAt, `${path}.retrievedAt`) }),
    ...(input.contentHash === undefined ? {} : { contentHash: text(input.contentHash, `${path}.contentHash`) }),
    ...(verifiedExcerpt === undefined ? {} : { verifiedExcerpt }),
    mapping,
    supportedEntityIds,
    ...(answerQuote === undefined ? {} : { answerQuote })
  };
  if (state === "available" && (!result.retrievedAt || !result.contentHash)) {
    fail(path, "Available retrieval requires timestamp and content hash.");
  }
  if (result.contentHash && !/^[a-f0-9]{64}$/i.test(result.contentHash)) {
    fail(`${path}.contentHash`, "Expected a SHA-256 content hash.");
  }
  if (state !== "available" && verifiedExcerpt !== undefined) fail(path, "Unavailable retrieval cannot provide a verified excerpt.");
  return result;
}

function validateEvidenceGrades(
  value: unknown,
  citations: Map<string, CitationSourceContract>,
  cells: Map<string, SucceededCell>,
  entities: Map<string, RecommendedEntityContract>
): void {
  const evidenceIds = new Set<string>();
  array(value, "$.evidenceGrades").forEach((item, index) => {
    const path = `$.evidenceGrades[${index}]`;
    const input = record(item, path);
    const evidenceId = text(input.evidenceId, `${path}.evidenceId`);
    if (evidenceIds.has(evidenceId)) fail(path, "Evidence IDs must be unique.");
    evidenceIds.add(evidenceId);
    const citationSourceId = text(input.citationSourceId, `${path}.citationSourceId`);
    const citation = citations.get(citationSourceId);
    if (!citation) fail(`${path}.citationSourceId`, "Evidence must reference a normalized citation source.");
    const cellId = text(input.cellId, `${path}.cellId`);
    if (citation.cellId !== cellId || !cells.has(cellId)) fail(`${path}.cellId`, "Evidence cell must match its citation source.");
    const repeatedPattern = input.repeatedPattern === undefined
      ? undefined
      : parseRepeatedPattern(input.repeatedPattern, `${path}.repeatedPattern`, cells);
    const reconstructed = {
      evidenceId, cellId, sourceUrl: citation.url, providerReturned: true,
      retrievalState: citation.retrieval.state, verifiedExcerpt: citation.retrieval.verifiedExcerpt,
      ...reconstructEvidenceRelationship(citation, cells.get(cellId)!, entities),
      ...(repeatedPattern ? { repeatedPattern } : {})
    };
    const expectedGrade = assessEvidenceGrade(reconstructed);
    if (input.grade !== expectedGrade) fail(`${path}.grade`, `Grade must be ${expectedGrade} when rebuilt from cell, source, and retrieval evidence.`);
  });
}

function reconstructEvidenceRelationship(
  citation: CitationSourceContract,
  cell: SucceededCell,
  entities: Map<string, RecommendedEntityContract>
): Pick<
  Parameters<typeof assessEvidenceGrade>[0],
  "directSupport" | "preciseMapping" | "relevantEntityEvidence" | "entityAmbiguous"
> {
  const supportedEntities = citation.retrieval.supportedEntityIds.map((id) => entities.get(id)!);
  const excerpt = citation.retrieval.verifiedExcerpt?.toLocaleLowerCase() ?? "";
  const relevantEntityEvidence = supportedEntities.length > 0 &&
    supportedEntities.every(({ name }) => excerpt.includes(name.toLocaleLowerCase()));
  const entityAmbiguous = supportedEntities.some(({ resolutionStatus }) => resolutionStatus !== "resolved");
  const preciseMapping = citation.retrieval.mapping === "precise" && Boolean(citation.retrieval.answerQuote) &&
    cell.answerText.includes(citation.retrieval.answerQuote!);
  const directSupport = preciseMapping && relevantEntityEvidence && citation.retrieval.state === "available";
  return { directSupport, preciseMapping, relevantEntityEvidence, entityAmbiguous };
}

function parseRepeatedPattern(value: unknown, path: string, cells: Map<string, SucceededCell>): RepeatedEvidencePattern {
  const input = record(value, path);
  const kind = text(input.kind, `${path}.kind`) as RepeatedEvidencePattern["kind"];
  if (!new Set(["entity", "source", "source_category", "evidence_type"]).has(kind)) fail(`${path}.kind`, "Unsupported pattern kind.");
  const patternValue = text(input.value, `${path}.value`);
  const occurrences = array(input.occurrences, `${path}.occurrences`).map((item, index) => {
    const occurrence = record(item, `${path}.occurrences[${index}]`);
    const cellId = text(occurrence.cellId, `${path}.occurrences[${index}].cellId`);
    const cell = cells.get(cellId);
    if (!cell) fail(`${path}.occurrences[${index}]`, "Repeated-pattern occurrence must reference a succeeded report cell.");
    if (cell.recommendationOutcome !== "recommendations_present" || occurrence.recommendationOutcome !== cell.recommendationOutcome) {
      fail(`${path}.occurrences[${index}]`, "Repeated-pattern occurrence must match a recommendation cell.");
    }
    const supportingText = text(occurrence.supportingText, `${path}.occurrences[${index}].supportingText`);
    if (!supportingText.toLocaleLowerCase().includes(patternValue.toLocaleLowerCase())) {
      fail(`${path}.occurrences[${index}].supportingText`, "Supporting text must contain the pattern value.");
    }
    return { cellId, recommendationOutcome: "recommendations_present" as const, supportingText };
  });
  if (occurrences.length < 2 || new Set(occurrences.map(({ cellId }) => cellId)).size !== occurrences.length) {
    fail(path, "Repeated pattern requires at least two distinct report cells.");
  }
  return { kind, value: patternValue, occurrences };
}

function validateSourceCategoryBreakdown(value: unknown, citations: Map<string, CitationSourceContract>): void {
  const seenCategories = new Set<CitationSourceCategory>();
  const seenCitationIds = new Set<string>();
  array(value, "$.sourceCategoryBreakdown").forEach((item, index) => {
    const path = `$.sourceCategoryBreakdown[${index}]`;
    const input = record(item, path);
    const category = citationCategory(input.category, `${path}.category`);
    if (seenCategories.has(category)) fail(path, "Category entries must be unique.");
    seenCategories.add(category);
    const ids = stringArray(input.citationSourceIds, `${path}.citationSourceIds`);
    if (new Set(ids).size !== ids.length || ids.some((id) => seenCitationIds.has(id))) fail(path, "Citation IDs must be unique across breakdown entries.");
    ids.forEach((id) => {
      if (citations.get(id)?.category !== category) fail(path, "Citation category does not match breakdown.");
      seenCitationIds.add(id);
    });
    if (nonNegativeInteger(input.sourceCount, `${path}.sourceCount`) !== ids.length) fail(`${path}.sourceCount`, "Count must match citation IDs.");
  });
  if (seenCitationIds.size !== citations.size) fail("$.sourceCategoryBreakdown", "Breakdown must cover every citation source exactly once.");
}

function validateCustomerGaps(value: unknown, cells: Map<string, SucceededCell>): void {
  array(value, "$.customerVsCompetitorGaps").forEach((item, index) => {
    const path = `$.customerVsCompetitorGaps[${index}]`;
    const input = record(item, path);
    const gap = {
      id: text(input.id, `${path}.id`), title: text(input.title, `${path}.title`),
      rationale: text(input.rationale, `${path}.rationale`),
      evidenceCellIds: validateCellIds(input.evidenceCellIds, `${path}.evidenceCellIds`, cells, true),
      sourcePattern: text(input.sourcePattern, `${path}.sourcePattern`),
      suggestedAction: text(input.suggestedAction, `${path}.suggestedAction`)
    };
    guarded(path, () => validateOpportunityHypothesis(gap));
    stringArray(input.competitorEntityIds, `${path}.competitorEntityIds`);
  });
}

function validateBlindSpot(value: unknown): void {
  const input = record(value, "$.homepageVsFullSiteBlindSpot");
  text(input.homepageSummary, "$.homepageVsFullSiteBlindSpot.homepageSummary");
  text(input.fullSiteSummary, "$.homepageVsFullSiteBlindSpot.fullSiteSummary");
  for (const field of ["omissions", "contradictions", "confidenceChanges", "limitations"] as const) {
    stringArray(input[field], `$.homepageVsFullSiteBlindSpot.${field}`);
  }
}

function validateExecutivePriorities(value: unknown, cells: Map<string, SucceededCell>): void {
  const priorities = array(value, "$.executivePriorities");
  if (priorities.length !== 3) fail("$.executivePriorities", "Expected exactly three executive priorities.");
  priorities.forEach((item, index) => {
    const path = `$.executivePriorities[${index}]`;
    const input = record(item, path);
    if (input.order !== index + 1) fail(`${path}.order`, "Priorities must be ordered 1, 2, 3.");
    text(input.title, `${path}.title`);
    text(input.rationale, `${path}.rationale`);
    validateCellIds(input.evidenceCellIds, `${path}.evidenceCellIds`, cells);
  });
}

function validateVendorTaskPackage(
  value: unknown,
  cells: Map<string, SucceededCell>,
  questionIds: Set<string>
): void {
  const input = record(value, "$.vendorTaskPackage");
  if (input.version !== "vendor-task-v1") fail("$.vendorTaskPackage.version", "Expected vendor-task-v1.");
  const ids = new Set<string>();
  array(input.tasks, "$.vendorTaskPackage.tasks").forEach((item, index) => {
    const path = `$.vendorTaskPackage.tasks[${index}]`;
    const task = record(item, path);
    const id = text(task.id, `${path}.id`);
    if (ids.has(id)) fail(path, "Task IDs must be unique.");
    ids.add(id);
    if (!new Set(["website", "content", "seo", "communications", "cross-functional"]).has(task.vendor as string)) {
      fail(`${path}.vendor`, "Unsupported vendor audience.");
    }
    text(task.title, `${path}.title`);
    text(task.rationale, `${path}.rationale`);
    if (stringArray(task.actions, `${path}.actions`).length === 0 ||
        stringArray(task.acceptanceCriteria, `${path}.acceptanceCriteria`).length === 0) {
      fail(path, "Vendor tasks require actions and acceptance criteria.");
    }
    validateCellIds(task.evidenceCellIds, `${path}.evidenceCellIds`, cells);
    const retestIds = stringArray(task.retestQuestionIds, `${path}.retestQuestionIds`);
    if (retestIds.some((questionId) => !questionIds.has(questionId))) fail(`${path}.retestQuestionIds`, "Unknown retest question.");
  });
}

function parseCommercialCoverage(value: unknown): CommercialCoverageDecision {
  const input = record(value, "$.answerSnapshotMatrix.commercialCoverage");
  if (!new Set(["qualified", "completed_limited", "failed"]).has(input.outcome as string)) fail("$.answerSnapshotMatrix.commercialCoverage.outcome", "Unsupported outcome.");
  return {
    outcome: input.outcome as CommercialCoverageDecision["outcome"],
    certifiedProviderCount: nonNegativeInteger(input.certifiedProviderCount, "$.answerSnapshotMatrix.commercialCoverage.certifiedProviderCount"),
    qualifyingProviderCount: nonNegativeInteger(input.qualifyingProviderCount, "$.answerSnapshotMatrix.commercialCoverage.qualifyingProviderCount"),
    successfulQuestionCount: nonNegativeInteger(input.successfulQuestionCount, "$.answerSnapshotMatrix.commercialCoverage.successfulQuestionCount"),
    reasons: stringArray(input.reasons, "$.answerSnapshotMatrix.commercialCoverage.reasons")
  };
}

function sameCommercialCoverage(left: CommercialCoverageDecision, right: CommercialCoverageDecision): boolean {
  return left.outcome === right.outcome && left.certifiedProviderCount === right.certifiedProviderCount &&
    left.qualifyingProviderCount === right.qualifyingProviderCount && left.successfulQuestionCount === right.successfulQuestionCount &&
    left.reasons.length === right.reasons.length && left.reasons.every((reason, index) => reason === right.reasons[index]);
}

type SucceededCell = Extract<AnswerSnapshotCell, { status: "succeeded" }>;

function validateCellIds(
  value: unknown,
  path: string,
  cells: Map<string, SucceededCell>,
  requireOne = false
): string[] {
  const ids = stringArray(value, path);
  if ((requireOne && ids.length === 0) || new Set(ids).size !== ids.length || ids.some((id) => !cells.has(id))) {
    fail(path, "Expected unique succeeded report cell IDs.");
  }
  return ids;
}

const CITATION_CATEGORIES = new Set<CitationSourceCategory>([
  "owned_customer", "owned_competitor", "earned_editorial", "directory_or_reference",
  "community_or_ugc", "institution", "social", "unknown"
]);

function citationCategory(value: unknown, path: string): CitationSourceCategory {
  const category = text(value, path) as CitationSourceCategory;
  if (!CITATION_CATEGORIES.has(category)) fail(path, "Unsupported citation source category.");
  return category;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "Expected an object.");
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) return fail(path, "Expected an array.");
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return array(value, path).map((item, index) => text(item, `${path}[${index}]`));
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) return fail(path, "Expected a non-empty string.");
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return fail(path, "Expected a non-negative integer.");
  return value as number;
}

function timestamp(value: unknown, path: string): string {
  const result = text(value, path);
  if (!Number.isFinite(Date.parse(result))) return fail(path, "Expected a timestamp.");
  return result;
}

function httpUrl(value: unknown, path: string): string {
  const result = text(value, path);
  try {
    const url = new URL(result);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) throw new Error();
  } catch {
    return fail(path, "Expected an absolute HTTP(S) URL.");
  }
  return result;
}

function guarded<T>(path: string, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RecommendationForensicReportValidationError) throw error;
    return fail(path, error instanceof Error ? error.message : "Validation failed.");
  }
}

function fail(path: string, message: string): never {
  throw new RecommendationForensicReportValidationError(path, message);
}
