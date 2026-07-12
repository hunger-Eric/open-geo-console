import {
  classifyCommercialCoverage,
  canonicalizeBrand,
  containsCanonicalBrand,
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
  categorizeSource,
  validateRecommendationSignal,
  validateOpportunityHypothesis,
  type CitationRetrievalState,
  type CitationSourceCategory,
  type EvidenceGrade,
  type RepeatedEvidencePattern,
  type RecommendationKind,
  type SourceCategoryContext,
  type EntityResolution
} from "@open-geo-console/citation-intelligence";
import type { AiWebsiteReportV1 } from "./types";
import { parseAiWebsiteReportV1 } from "./validation";

export const RECOMMENDATION_FORENSIC_REPORT_VERSION = 1 as const;

export interface ExecutiveVerdictContract {
  summary: string;
  customerMentioned: "yes" | "no" | "mixed" | "unknown";
  primaryGap: string;
  evidenceCellIds: string[];
  coverageOutcome: CommercialCoverageDecision["outcome"];
}

export interface AnswerSnapshotMatrixContract {
  run: AnswerSnapshotRunContract;
  cells: AnswerSnapshotCell[];
  commercialCoverage: CommercialCoverageDecision;
}

export interface RecommendedEntityContract {
  entityId: string;
  name: string;
  registrableDomain?: string;
  resolution: EntityResolution;
  signals: Array<{
    cellId: string;
    kind: RecommendationKind;
    supportingQuote: string;
  }>;
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
  outcome: "competitor_gap" | "no_recommendation";
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
  websiteFindingIds: string[];
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
  sourceCategoryContext: SourceCategoryContext;
  sourceClassificationAuthorityVersion: string;
  sourceClassificationCapturedAt: string;
}

export interface SourceClassificationAuthoritySnapshot {
  authorityVersion: string;
  capturedAt: string;
  context: SourceCategoryContext;
}

export interface RecommendationForensicReportParseOptions {
  certificationAuthority: CertificationAuthoritySnapshot;
  sourceClassificationAuthority: SourceClassificationAuthoritySnapshot;
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
  options: RecommendationForensicReportParseOptions
): RecommendationForensicReportV1 {
  const optionsRecord = record(options, "options");
  const authority = parseCertificationAuthority(optionsRecord.certificationAuthority);
  const sourceAuthority = parseSourceClassificationAuthority(optionsRecord.sourceClassificationAuthority);
  const report = record(value, "$" );
  if (report.version !== RECOMMENDATION_FORENSIC_REPORT_VERSION) fail("$.version", "Expected recommendation-forensic version 1.");
  const reportId = text(report.reportId, "$.reportId");
  const jobId = text(report.jobId, "$.jobId");
  const targetUrl = httpUrl(report.targetUrl, "$.targetUrl");
  const provenance = parseProvenance(report.provenanceAndLimitations, authority, sourceAuthority);
  const questions = parseGeneratedQuestions(report.generatedQuestions);
  const matrix = parseAnswerSnapshotMatrix(report.answerSnapshotMatrix, {
    reportId, jobId, locale: provenance.locale, region: provenance.region, questions, authority
  });
  const succeededCells = new Map(
    matrix.cells.filter((cell): cell is Extract<AnswerSnapshotCell, { status: "succeeded" }> => cell.status === "succeeded")
      .map((cell) => [cell.id, cell])
  );
  validateCertificationProvenance(provenance.certificationProvenance, matrix.cells, authority);
  validateExecutiveVerdict(
    report.executiveVerdict, succeededCells, matrix.commercialCoverage.outcome, authority
  );
  const recommendedEntities = validateRecommendedEntities(report.recommendedEntities, succeededCells);
  validateSourceCategoryIdentityContext(targetUrl, provenance.sourceCategoryContext, recommendedEntities);
  const recommendationSignals = indexRecommendationSignals(recommendedEntities);
  const citationSources = parseCitationSources(
    report.citationSources, succeededCells, recommendedEntities, provenance.sourceCategoryContext
  );
  const gradedCitationIds = validateEvidenceGrades(
    report.evidenceGrades, citationSources, succeededCells, recommendedEntities, recommendationSignals
  );
  validateSourceCategoryBreakdown(report.sourceCategoryBreakdown, citationSources);
  const gaps = validateCustomerGaps(report.customerVsCompetitorGaps, succeededCells, recommendedEntities);
  validateBlindSpot(report.homepageVsFullSiteBlindSpot);
  const vendorTaskCount = validateVendorTaskPackage(
    report.vendorTaskPackage, succeededCells, new Set(questions.questions.map(({ id }) => id)
  ));
  const appendix = guarded("$.websiteFoundationAppendix", () => parseAiWebsiteReportV1(report.websiteFoundationAppendix));
  if (appendix.tier !== "deep" || appendix.targetUrl !== targetUrl || appendix.provenance.locale !== provenance.locale) {
    fail("$.websiteFoundationAppendix", "Appendix must be the matching deep website-foundation report.");
  }
  const appendixBrands = [
    appendix.organizationProfile.organizationName,
    ...appendix.organizationProfile.brandNames
  ].filter((brand): brand is string => Boolean(brand));
  const appendixBrandKeys = new Set(appendixBrands.map(canonicalizeBrand));
  if (!appendixBrandKeys.has(canonicalizeBrand(questions.organizationName)) ||
      questions.brandAliases.some((alias) => !appendixBrandKeys.has(canonicalizeBrand(alias)))) {
    fail("$.generatedQuestions", "Organization name and aliases must be grounded in the website foundation appendix.");
  }
  const websiteFindingIds = new Set(
    appendix.findings.filter(({ evidence }) => evidence.length > 0).map(({ id }) => id)
  );
  validateExecutivePriorities(report.executivePriorities, succeededCells, websiteFindingIds);
  validateCommercialReportCompleteness(
    matrix, authority, recommendedEntities, recommendationSignals,
    citationSources, gradedCitationIds, gaps, vendorTaskCount
  );
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

function parseProvenance(
  value: unknown,
  authority: CertificationAuthoritySnapshot,
  sourceAuthority: SourceClassificationAuthoritySnapshot
): ProvenanceAndLimitationsContract {
  const input = record(value, "$.provenanceAndLimitations");
  if (input.certificationAuthorityVersion !== authority.authorityVersion || input.certificationCapturedAt !== authority.capturedAt) {
    fail("$.provenanceAndLimitations", "Certification provenance must match the external CertificationAuthority snapshot.");
  }
  if (input.sourceClassificationAuthorityVersion !== sourceAuthority.authorityVersion ||
      input.sourceClassificationCapturedAt !== sourceAuthority.capturedAt) {
    fail("$.provenanceAndLimitations", "Source classification provenance must match the external authority snapshot.");
  }
  const certificationProvenance = array(input.certificationProvenance, "$.provenanceAndLimitations.certificationProvenance")
    .map((item, index) => {
      const entry = record(item, `$.provenanceAndLimitations.certificationProvenance[${index}]`);
      return {
        surfaceKey: text(entry.surfaceKey, `$.provenanceAndLimitations.certificationProvenance[${index}].surfaceKey`),
        evidenceReference: text(entry.evidenceReference, `$.provenanceAndLimitations.certificationProvenance[${index}].evidenceReference`)
      };
    });
  const sourceCategoryContext = parseSourceCategoryContext(input.sourceCategoryContext);
  if (JSON.stringify(sourceCategoryContext) !== JSON.stringify(sourceAuthority.context)) {
    fail("$.provenanceAndLimitations.sourceCategoryContext", "Source classification context must exactly match the external authority snapshot.");
  }
  return {
    generatedAt: timestamp(input.generatedAt, "$.provenanceAndLimitations.generatedAt"),
    locale: text(input.locale, "$.provenanceAndLimitations.locale"),
    region: text(input.region, "$.provenanceAndLimitations.region"),
    certificationAuthorityVersion: authority.authorityVersion,
    certificationCapturedAt: authority.capturedAt,
    certificationProvenance,
    limitations: stringArray(input.limitations, "$.provenanceAndLimitations.limitations"),
    methodology: text(input.methodology, "$.provenanceAndLimitations.methodology"),
    sourceCategoryContext,
    sourceClassificationAuthorityVersion: sourceAuthority.authorityVersion,
    sourceClassificationCapturedAt: sourceAuthority.capturedAt
  };
}

function parseSourceClassificationAuthority(value: unknown): SourceClassificationAuthoritySnapshot {
  if (!value) fail("SourceClassificationAuthority", "An external source classification authority snapshot is required.");
  const input = record(value, "SourceClassificationAuthority");
  return {
    authorityVersion: text(input.authorityVersion, "SourceClassificationAuthority.authorityVersion"),
    capturedAt: timestamp(input.capturedAt, "SourceClassificationAuthority.capturedAt"),
    context: parseSourceCategoryContext(input.context)
  };
}

function parseSourceCategoryContext(value: unknown): SourceCategoryContext {
  const input = record(value, "$.provenanceAndLimitations.sourceCategoryContext");
  const customerRegistrableDomain = domain(input.customerRegistrableDomain, "$.provenanceAndLimitations.sourceCategoryContext.customerRegistrableDomain");
  const competitorRegistrableDomains = stringArray(
    input.competitorRegistrableDomains,
    "$.provenanceAndLimitations.sourceCategoryContext.competitorRegistrableDomains"
  ).map((item, index) => domain(item, `$.provenanceAndLimitations.sourceCategoryContext.competitorRegistrableDomains[${index}]`));
  const knownDomainsInput = input.knownDomains === undefined
    ? {}
    : record(input.knownDomains, "$.provenanceAndLimitations.sourceCategoryContext.knownDomains");
  const knownDomains: SourceCategoryContext["knownDomains"] = {};
  for (const [knownDomain, categoryValue] of Object.entries(knownDomainsInput)) {
    const category = citationCategory(
      categoryValue, `$.provenanceAndLimitations.sourceCategoryContext.knownDomains.${knownDomain}`
    );
    if (category === "owned_customer" || category === "owned_competitor") {
      fail("$.provenanceAndLimitations.sourceCategoryContext.knownDomains", "Owned categories come only from registrable-domain context.");
    }
    knownDomains![domain(knownDomain, "$.provenanceAndLimitations.sourceCategoryContext.knownDomains")] = category;
  }
  return { customerRegistrableDomain, competitorRegistrableDomains, knownDomains };
}

function parseGeneratedQuestions(value: unknown): GeneratedQuestionSet {
  const input = record(value, "$.generatedQuestions");
  if (input.version !== "purchase-v1") fail("$.generatedQuestions.version", "Expected purchase-v1.");
  const organizationName = text(input.organizationName, "$.generatedQuestions.organizationName");
  const brandAliases = stringArray(input.brandAliases, "$.generatedQuestions.brandAliases");
  const normalizedBrands = [organizationName, ...brandAliases].map(canonicalizeBrand);
  if (normalizedBrands.some((brand) => !brand) || new Set(normalizedBrands).size !== normalizedBrands.length) {
    fail("$.generatedQuestions.brandAliases", "Canonical brands must be non-empty and unique.");
  }
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
    if (containsCanonicalBrand(question.exactText, [organizationName, ...brandAliases])) {
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

function validateExecutiveVerdict(
  value: unknown,
  cells: Map<string, SucceededCell>,
  coverageOutcome: CommercialCoverageDecision["outcome"],
  authority: CertificationAuthoritySnapshot
): void {
  const input = record(value, "$.executiveVerdict");
  text(input.summary, "$.executiveVerdict.summary");
  text(input.primaryGap, "$.executiveVerdict.primaryGap");
  if (!new Set(["yes", "no", "mixed", "unknown"]).has(input.customerMentioned as string)) {
    fail("$.executiveVerdict.customerMentioned", "Unsupported mention outcome.");
  }
  if (input.coverageOutcome !== coverageOutcome) {
    fail("$.executiveVerdict.coverageOutcome", "Verdict coverage outcome must match commercial coverage.");
  }
  const certifiedKeys = new Set(authority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const commercialCells = new Map([...cells].filter(([, cell]) => certifiedKeys.has(createAnswerEngineSurfaceKey(cell.surface))));
  validateCellIds(
    input.evidenceCellIds, "$.executiveVerdict.evidenceCellIds",
    coverageOutcome === "failed" ? cells : commercialCells,
    coverageOutcome !== "failed"
  );
}

function validateRecommendedEntities(
  value: unknown,
  cells: Map<string, SucceededCell>
): Map<string, RecommendedEntityContract> {
  const entities = array(value, "$.recommendedEntities");
  const result = new Map<string, RecommendedEntityContract>();
  entities.forEach((item, index) => {
    const path = `$.recommendedEntities[${index}]`;
    const entity = record(item, path);
    const entityId = text(entity.entityId, `${path}.entityId`);
    if (result.has(entityId)) fail("$.recommendedEntities", "Entity IDs must be unique.");
    const name = text(entity.name, `${path}.name`);
    const registrableDomain = entity.registrableDomain === undefined
      ? undefined
      : domain(entity.registrableDomain, `${path}.registrableDomain`);
    const resolutionInput = record(entity.resolution, `${path}.resolution`);
    let resolution: EntityResolution;
    if (resolutionInput.status === "resolved") {
      resolution = {
        status: "resolved",
        entityId: text(resolutionInput.entityId, `${path}.resolution.entityId`),
        basis: text(resolutionInput.basis, `${path}.resolution.basis`) as Extract<EntityResolution, { status: "resolved" }>["basis"]
      };
    } else if (resolutionInput.status === "ambiguous") {
      resolution = {
        status: "ambiguous",
        candidateEntityIds: stringArray(resolutionInput.candidateEntityIds, `${path}.resolution.candidateEntityIds`)
      };
    } else if (resolutionInput.status === "unresolved") {
      const candidateEntityIds = stringArray(resolutionInput.candidateEntityIds, `${path}.resolution.candidateEntityIds`);
      if (candidateEntityIds.length !== 0) fail(`${path}.resolution`, "Unresolved identity cannot name candidates.");
      resolution = { status: "unresolved", candidateEntityIds: [] };
    } else {
      resolution = fail(`${path}.resolution.status`, "Unsupported entity resolution.");
    }
    const signals = array(entity.signals, `${path}.signals`).map((item, signalIndex) => {
      const signalPath = `${path}.signals[${signalIndex}]`;
      const signal = record(item, signalPath);
      const cellId = text(signal.cellId, `${signalPath}.cellId`);
      const cell = cells.get(cellId);
      if (!cell || cell.recommendationOutcome !== "recommendations_present") {
        fail(`${signalPath}.cellId`, "Recommendation signal must reference a succeeded recommendation cell.");
      }
      const kind = text(signal.kind, `${signalPath}.kind`) as RecommendationKind;
      if (!new Set(["direct_candidate", "preferred_choice", "example", "suitability"]).has(kind)) {
        fail(`${signalPath}.kind`, "Unsupported recommendation kind.");
      }
      const supportingQuote = text(signal.supportingQuote, `${signalPath}.supportingQuote`);
      if (!cell.answerText.includes(supportingQuote)) {
        fail(`${signalPath}.supportingQuote`, "Recommendation quote must be an exact answerText substring.");
      }
      guarded(signalPath, () => validateRecommendationSignal({
        entityId, entityName: name, kind, supportingText: supportingQuote
      }));
      return { cellId, kind, supportingQuote };
    });
    if (signals.length === 0) fail(`${path}.signals`, "Recommended entities require at least one signal.");
    result.set(entityId, {
      entityId, name, ...(registrableDomain ? { registrableDomain } : {}), resolution, signals
    });
  });
  for (const [entityId, entity] of result) {
    const path = `$.recommendedEntities.${entityId}.resolution`;
    const resolution = entity.resolution;
    if (resolution.status === "resolved") {
      if (resolution.entityId !== entityId || !new Set(["registrable_domain", "context", "unique_name"]).has(resolution.basis)) {
        fail(path, "Resolved identity must close on its containing entity.");
      }
    } else if (resolution.status === "ambiguous") {
      if (resolution.candidateEntityIds.length < 2 || new Set(resolution.candidateEntityIds).size !== resolution.candidateEntityIds.length ||
          resolution.candidateEntityIds.some((id) => !result.has(id))) {
        fail(path, "Ambiguous resolution candidates must reference known unique entities.");
      }
    } else if (resolution.status !== "unresolved" || resolution.candidateEntityIds.length !== 0) {
      fail(path, "Unsupported or open entity resolution.");
    }
  }
  return result;
}

function indexRecommendationSignals(
  entities: Map<string, RecommendedEntityContract>
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const entity of entities.values()) {
    for (const signal of entity.signals) {
      const quotes = result.get(signal.cellId) ?? new Set<string>();
      quotes.add(signal.supportingQuote);
      result.set(signal.cellId, quotes);
    }
  }
  return result;
}

function validateSourceCategoryIdentityContext(
  targetUrl: string,
  context: SourceCategoryContext,
  entities: Map<string, RecommendedEntityContract>
): void {
  const targetHostname = new URL(targetUrl).hostname.toLocaleLowerCase();
  if (!sameSite(targetHostname, context.customerRegistrableDomain)) {
    fail("$.provenanceAndLimitations.sourceCategoryContext.customerRegistrableDomain", "Customer domain must contain the report target.");
  }
  const entityDomains = [...entities.values()]
    .map(({ registrableDomain }) => registrableDomain)
    .filter((value): value is string => Boolean(value))
    .sort();
  const contextDomains = [...context.competitorRegistrableDomains].sort();
  if (JSON.stringify(entityDomains) !== JSON.stringify(contextDomains)) {
    fail("$.provenanceAndLimitations.sourceCategoryContext.competitorRegistrableDomains", "Competitor domains must exactly match recommended entity identities.");
  }
}

function sameSite(hostname: string, registrableDomain: string): boolean {
  return hostname === registrableDomain || hostname.endsWith(`.${registrableDomain}`);
}

function parseCitationSources(
  value: unknown,
  cells: Map<string, SucceededCell>,
  entities: Map<string, RecommendedEntityContract>,
  categoryContext: SourceCategoryContext
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
    const suppliedCategory = citationCategory(input.category, `${path}.category`);
    const category = categorizeSource(url, categoryContext);
    if (suppliedCategory !== category) {
      fail(`${path}.category`, `Category must be ${category} when recomputed from registrable-domain context.`);
    }
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
  entities: Map<string, RecommendedEntityContract>,
  recommendationSignals: Map<string, Set<string>>
): Set<string> {
  const evidenceIds = new Set<string>();
  const gradedCitationIds = new Set<string>();
  array(value, "$.evidenceGrades").forEach((item, index) => {
    const path = `$.evidenceGrades[${index}]`;
    const input = record(item, path);
    const evidenceId = text(input.evidenceId, `${path}.evidenceId`);
    if (evidenceIds.has(evidenceId)) fail(path, "Evidence IDs must be unique.");
    evidenceIds.add(evidenceId);
    const citationSourceId = text(input.citationSourceId, `${path}.citationSourceId`);
    const citation = citations.get(citationSourceId);
    if (!citation) fail(`${path}.citationSourceId`, "Evidence must reference a normalized citation source.");
    if (gradedCitationIds.has(citationSourceId)) fail(`${path}.citationSourceId`, "Citation sources must have exactly one grade.");
    gradedCitationIds.add(citationSourceId);
    const cellId = text(input.cellId, `${path}.cellId`);
    if (citation.cellId !== cellId || !cells.has(cellId)) fail(`${path}.cellId`, "Evidence cell must match its citation source.");
    const repeatedPattern = input.repeatedPattern === undefined
      ? undefined
      : parseRepeatedPattern(input.repeatedPattern, `${path}.repeatedPattern`, cells, recommendationSignals);
    const reconstructed = {
      evidenceId, cellId, sourceUrl: citation.url, providerReturned: true,
      retrievalState: citation.retrieval.state, verifiedExcerpt: citation.retrieval.verifiedExcerpt,
      ...reconstructEvidenceRelationship(citation, cells.get(cellId)!, entities),
      ...(repeatedPattern ? { repeatedPattern } : {})
    };
    const expectedGrade = assessEvidenceGrade(reconstructed);
    if (input.grade !== expectedGrade) fail(`${path}.grade`, `Grade must be ${expectedGrade} when rebuilt from cell, source, and retrieval evidence.`);
  });
  return gradedCitationIds;
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
  const entityAmbiguous = supportedEntities.some(({ resolution }) => resolution.status !== "resolved");
  const preciseMapping = citation.retrieval.mapping === "precise" && Boolean(citation.retrieval.answerQuote) &&
    cell.answerText.includes(citation.retrieval.answerQuote!);
  const directSupport = preciseMapping && relevantEntityEvidence && citation.retrieval.state === "available";
  return { directSupport, preciseMapping, relevantEntityEvidence, entityAmbiguous };
}

function parseRepeatedPattern(
  value: unknown,
  path: string,
  cells: Map<string, SucceededCell>,
  recommendationSignals: Map<string, Set<string>>
): RepeatedEvidencePattern {
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
    if (!cell.answerText.includes(supportingText)) {
      fail(`${path}.occurrences[${index}].supportingText`, "Supporting text must be an exact answerText substring.");
    }
    if (!recommendationSignals.get(cellId)?.has(supportingText)) {
      fail(`${path}.occurrences[${index}].supportingText`, "Grade C occurrence must bind an exact recommendation signal quote.");
    }
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

function validateCustomerGaps(
  value: unknown,
  cells: Map<string, SucceededCell>,
  entities: Map<string, RecommendedEntityContract>
): CustomerVsCompetitorGapContract[] {
  return array(value, "$.customerVsCompetitorGaps").map((item, index) => {
    const path = `$.customerVsCompetitorGaps[${index}]`;
    const input = record(item, path);
    const evidenceCellIds = validateCellIds(input.evidenceCellIds, `${path}.evidenceCellIds`, cells, true);
    const competitorEntityIds = stringArray(input.competitorEntityIds, `${path}.competitorEntityIds`);
    const outcome = text(input.outcome, `${path}.outcome`) as CustomerVsCompetitorGapContract["outcome"];
    if (outcome !== "competitor_gap" && outcome !== "no_recommendation") fail(`${path}.outcome`, "Unsupported gap outcome.");
    if (outcome === "competitor_gap") {
      if (competitorEntityIds.length === 0 || competitorEntityIds.some((id) => !entities.has(id))) {
        fail(`${path}.competitorEntityIds`, "Competitor gaps require known recommended entity IDs.");
      }
      for (const entityId of competitorEntityIds) {
        if (!entities.get(entityId)!.signals.some(({ cellId }) => evidenceCellIds.includes(cellId))) {
          fail(`${path}.evidenceCellIds`, "Gap evidence must support every referenced competitor entity.");
        }
      }
    } else if (competitorEntityIds.length > 0 || evidenceCellIds.some((id) => cells.get(id)!.recommendationOutcome !== "no_recommendation")) {
      fail(path, "No-recommendation gaps require only truthful no-recommendation cells and no competitor IDs.");
    }
    const gap = {
      id: text(input.id, `${path}.id`), title: text(input.title, `${path}.title`),
      rationale: text(input.rationale, `${path}.rationale`),
      evidenceCellIds,
      sourcePattern: text(input.sourcePattern, `${path}.sourcePattern`),
      suggestedAction: text(input.suggestedAction, `${path}.suggestedAction`),
      competitorEntityIds,
      outcome
    };
    guarded(path, () => validateOpportunityHypothesis(gap));
    return gap;
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

function validateExecutivePriorities(
  value: unknown,
  cells: Map<string, SucceededCell>,
  websiteFindingIds: Set<string>
): void {
  const priorities = array(value, "$.executivePriorities");
  if (priorities.length !== 3) fail("$.executivePriorities", "Expected exactly three executive priorities.");
  priorities.forEach((item, index) => {
    const path = `$.executivePriorities[${index}]`;
    const input = record(item, path);
    if (input.order !== index + 1) fail(`${path}.order`, "Priorities must be ordered 1, 2, 3.");
    text(input.title, `${path}.title`);
    text(input.rationale, `${path}.rationale`);
    const answerEvidence = validateCellIds(input.evidenceCellIds, `${path}.evidenceCellIds`, cells);
    const websiteEvidence = stringArray(input.websiteFindingIds, `${path}.websiteFindingIds`);
    if (websiteEvidence.some((id) => !websiteFindingIds.has(id))) {
      fail(`${path}.websiteFindingIds`, "Priority website evidence must reference a matching appendix finding with evidence.");
    }
    if (answerEvidence.length + websiteEvidence.length === 0) {
      fail(path, "Every executive priority requires answer-cell or website-finding evidence.");
    }
  });
}

function validateVendorTaskPackage(
  value: unknown,
  cells: Map<string, SucceededCell>,
  questionIds: Set<string>
): number {
  const input = record(value, "$.vendorTaskPackage");
  if (input.version !== "vendor-task-v1") fail("$.vendorTaskPackage.version", "Expected vendor-task-v1.");
  const ids = new Set<string>();
  const tasks = array(input.tasks, "$.vendorTaskPackage.tasks");
  tasks.forEach((item, index) => {
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
    validateCellIds(task.evidenceCellIds, `${path}.evidenceCellIds`, cells, true);
    const retestIds = stringArray(task.retestQuestionIds, `${path}.retestQuestionIds`);
    if (retestIds.length === 0 || retestIds.some((questionId) => !questionIds.has(questionId))) {
      fail(`${path}.retestQuestionIds`, "Vendor tasks require at least one known retest question.");
    }
  });
  return tasks.length;
}

function validateCommercialReportCompleteness(
  matrix: AnswerSnapshotMatrixContract,
  authority: CertificationAuthoritySnapshot,
  entities: Map<string, RecommendedEntityContract>,
  recommendationSignals: Map<string, Set<string>>,
  citations: Map<string, CitationSourceContract>,
  gradedCitationIds: Set<string>,
  gaps: CustomerVsCompetitorGapContract[],
  vendorTaskCount: number
): void {
  if (matrix.commercialCoverage.outcome === "failed") return;
  const succeeded = matrix.cells.filter((cell): cell is SucceededCell => cell.status === "succeeded");
  const recommendationCells = succeeded.filter(({ recommendationOutcome }) => recommendationOutcome === "recommendations_present");
  const noRecommendationCells = succeeded.filter(({ recommendationOutcome }) => recommendationOutcome === "no_recommendation");
  if ((recommendationCells.length > 0 && entities.size === 0) ||
      (recommendationCells.length === 0 && noRecommendationCells.length === 0)) {
    fail("$.recommendedEntities", "Limited or qualified reports require an auditable recommendation or truthful no-recommendation outcome.");
  }
  const certifiedSurfaceKeys = new Set(authority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const citationKeys = new Set([...citations.values()].map(({ cellId, url }) => `${cellId}\n${url}`));
  for (const cell of succeeded) {
    if (!certifiedSurfaceKeys.has(createAnswerEngineSurfaceKey(cell.surface))) continue;
    if (cell.recommendationOutcome === "recommendations_present" && !recommendationSignals.has(cell.id)) {
      fail("$.recommendedEntities", "Every externally certified commercial recommendation cell requires an exact-quote entity signal.");
    }
    for (const source of cell.sources) {
      if (!citationKeys.has(`${cell.id}\n${source.url}`)) {
        fail("$.citationSources", "Every provider-returned source in certified commercial coverage must be normalized.");
      }
    }
  }
  if ([...citations.keys()].some((id) => !gradedCitationIds.has(id))) {
    fail("$.evidenceGrades", "Every normalized commercial citation source requires an evidence grade.");
  }
  if (gaps.length === 0) fail("$.customerVsCompetitorGaps", "Limited or qualified reports require at least one evidence-backed gap.");
  if (recommendationCells.length === 0 && !gaps.some(({ outcome }) => outcome === "no_recommendation")) {
    fail("$.customerVsCompetitorGaps", "All-no-recommendation coverage requires an explicit no-recommendation gap outcome.");
  }
  if (vendorTaskCount === 0) {
    fail("$.vendorTaskPackage.tasks", "Limited or qualified reports require executable vendor tasks.");
  }
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

function domain(value: unknown, path: string): string {
  const result = text(value, path).toLocaleLowerCase().replace(/^\.+|\.+$/g, "");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(result)) {
    return fail(path, "Expected a registrable domain.");
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
